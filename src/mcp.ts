import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdrEngine } from './engine.js';
import type { AdrStatus, SectionType } from './types.js';
import { loadWardenConfig } from './config.js';
import { createRemoteResolver } from './remote/resolver.js';
import type { RemoteProviderConfig } from './remote/types.js';

export interface McpServerConfig {
  adrDirs?: string[];
  cacheDir?: string;
  modelName?: string;
  mode?: 'author' | 'construct' | 'all';
  remote?: RemoteProviderConfig;
  indexUrl?: string;
}

export function discoverDefaultAdrDirs(configuredDirs?: string[]): string[] {
  if (configuredDirs && configuredDirs.length > 0) {
    return configuredDirs.map((d) => resolve(d));
  }

  const envDirs = process.env.ADR_DIRS;
  if (envDirs) {
    return envDirs
      .split(',')
      .map((d) => resolve(d.trim()))
      .filter((d) => existsSync(d));
  }

  const candidates = [
    './docs/adr',
    './adr',
    './docs/adrs',
    './doc/adr',
  ];

  const found: string[] = [];
  for (const c of candidates) {
    const resolved = resolve(c);
    if (existsSync(resolved)) {
      found.push(resolved);
    }
  }

  return found;
}

export function createMcpServer(userConfig: McpServerConfig = {}): {
  server: McpServer;
  engine: AdrEngine;
  init: () => Promise<void>;
} {
  const loadedConfig = loadWardenConfig();
  const config: McpServerConfig = {
    ...loadedConfig,
    ...userConfig,
    remote: userConfig.remote || loadedConfig.remote,
  };

  const mode = config.mode || 'all';
  const isAuthor = mode === 'author' || mode === 'all';
  const isConstruct = mode === 'construct' || mode === 'all';

  const cacheDir =
    config.cacheDir ||
    process.env.ADR_CACHE_DIR ||
    resolve(process.cwd(), '.adr-cache');

  const engine = new AdrEngine({
    cacheDir,
    modelName: config.modelName,
  });

  const server = new McpServer({
    name: 'adr-warden',
    version: '1.0.4',
  });

  const adrDirs = discoverDefaultAdrDirs(config.adrDirs);

  const init = async () => {
    // 1. Configure remote resolver if provided
    if (config.remote) {
      engine.setRemoteResolver(createRemoteResolver(config.remote));
    }

    // 2. Load remote index if specified
    const indexSource = config.indexUrl || config.remote?.indexUrl;
    if (indexSource) {
      try {
        await engine.loadRemoteIndex(indexSource, { token: config.remote?.token });
      } catch (err) {
        process.stderr.write(
          `Warning: Could not load remote ADR index from ${indexSource}: ${(err as Error).message}\n`
        );
      }
    }

    // 3. Scan local directories if available and store is empty
    if (adrDirs.length > 0 && engine.getVectorStore().getDocumentCount() === 0) {
      await engine.indexDirectories(adrDirs);
    }
  };

  // ==========================================
  // CONSTRUCTION TOOLS (progressive disclosure)
  // ==========================================
  if (isConstruct) {
    // Tool: align_changeset
    server.tool(
      'align_changeset',
      'Analyzes a git changeset or diff against indexed Architecture Decision Records (ADRs). Flags binding approved standards vs proposed in-flight advisories, with compliance guidance, matched files, and provider web links.',
      {
        diff: z.string().optional().describe('Raw git diff text to evaluate (if omitted, reads from local git working tree)'),
        ref: z.string().optional().describe('Git reference or revision range to compare (e.g. "origin/main...HEAD", "HEAD~1")'),
        staged: z.boolean().optional().describe('Compare staged git changes (default false)'),
        summary: z.string().optional().describe('Optional PR title or summary text explaining the changeset intent'),
        threshold: z.number().optional().describe('Relevance threshold cutoff (default 0.32)'),
      },
      async ({ diff, ref, staged, summary, threshold }) => {
        try {
          const report = await engine.alignChangeset(
            diff || { diffRef: ref, staged, summary },
            { threshold }
          );

          let output = `## Architecture Decision Alignment Report\n\n`;
          output += `- **Files Evaluated:** ${report.targetChangeset.filesCount}\n`;
          output += `- **Dependencies Touched:** ${report.targetChangeset.dependenciesCount}\n`;
          output += `- **Summary:** ${report.summary}\n\n`;

          if (report.bindingStandards.length > 0) {
            output += `### 🔴 Binding Architectural Standards (${report.bindingStandards.length})\n\n`;
            for (const m of report.bindingStandards) {
              output += `#### [ADR-${m.adrId}] ${m.title} (Status: ${m.status.toUpperCase()})\n`;
              output += `- **Relevance Score:** ${Math.round(m.score * 100)}%\n`;
              if (m.webUrl) output += `- **Web Link:** ${m.webUrl}\n`;
              if (m.matchedFiles.length > 0) output += `- **Governs Files:** ${m.matchedFiles.join(', ')}\n`;
              if (m.matchedKeywords.length > 0) output += `- **Matched Topics:** ${m.matchedKeywords.join(', ')}\n`;
              output += `- **Mandatory Decision:**\n> ${m.decision.slice(0, 300).replace(/\n/g, ' ')}...\n\n`;
              for (const obs of m.observations) {
                output += `  * ${obs}\n`;
              }
              output += '\n';
            }
          }

          if (report.inFlightProposals.length > 0) {
            output += `### 🟡 In-Flight Proposals (Heads-Up Advisory) (${report.inFlightProposals.length})\n\n`;
            for (const m of report.inFlightProposals) {
              output += `#### [ADR-${m.adrId}] (PROPOSED) ${m.title}\n`;
              output += `- **Relevance Score:** ${Math.round(m.score * 100)}%\n`;
              if (m.webUrl) output += `- **Web Link:** ${m.webUrl}\n`;
              if (m.matchedFiles.length > 0) output += `- **Intersects Files:** ${m.matchedFiles.join(', ')}\n`;
              output += `- **Proposed Direction:**\n> ${m.decision.slice(0, 250).replace(/\n/g, ' ')}...\n\n`;
              for (const obs of m.observations) {
                output += `  * ${obs}\n`;
              }
              output += '\n';
            }
          }

          if (report.historicalMatches.length > 0) {
            output += `### 📜 Historical Records (${report.historicalMatches.length})\n\n`;
            for (const m of report.historicalMatches) {
              output += `- **ADR-${m.adrId}** [${m.status.toUpperCase()}]: ${m.title}\n`;
              for (const obs of m.observations) {
                output += `  * ${obs}\n`;
              }
            }
            output += '\n';
          }

          if (
            report.bindingStandards.length === 0 &&
            report.inFlightProposals.length === 0
          ) {
            output += `✅ No overlapping architectural decisions or pending proposals detected for this changeset.\n`;
          }

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error evaluating changeset alignment: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: fetch_adr_index
    server.tool(
      'fetch_adr_index',
      'Fetches or refreshes the architecture decision record index from a remote URL or hosted artifact cache.',
      {
        url: z.string().optional().describe('Remote URL or local path to index.json (defaults to configured indexUrl)'),
        force: z.boolean().optional().describe('Force fresh download ignoring ETag cache (default false)'),
      },
      async ({ url, force }) => {
        try {
          const target = url || config.indexUrl || config.remote?.indexUrl;
          if (!target) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: 'No index URL specified or configured in .wardenrc.json.',
                },
              ],
            };
          }

          const res = await engine.loadRemoteIndex(target, {
            force,
            token: config.remote?.token,
          });

          return {
            content: [
              {
                type: 'text',
                text: `Successfully synchronized ADR index from ${target}.\n- Records Loaded: ${res.count}\n- Served from Cache: ${res.fromCache ? 'Yes' : 'No (Fresh Download)'}`,
              },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Failed to fetch ADR index: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );
  }

  // ==========================================
  // SHARED TOOLS (Search, Get, List)
  // ==========================================
  // Tool: search_adrs
  server.tool(
    'search_adrs',
    'Semantically search indexed Architecture Decision Records (ADRs) by architectural topic, constraint, technology keyword, or natural language query.',
    {
      query: z.string().describe('Search query or architectural topic'),
      top_k: z.number().optional().describe('Number of results to return (default 5)'),
      threshold: z.number().optional().describe('Minimum similarity score cutoff (default 0.35)'),
      status: z.string().optional().describe('Filter results by ADR status (e.g. "accepted", "proposed", "superseded")'),
      section: z.enum(['all', 'summary', 'context', 'decision', 'options']).optional().describe('Target a specific ADR section (default "all")'),
      mode: z.enum(['hybrid', 'dense', 'sparse']).optional().describe('Search execution mode: "hybrid" (RRF dense+BM25), "dense" (vectors only), or "sparse" (BM25 keywords only). Default "hybrid"'),
    },
    async ({ query, top_k, threshold, status, section, mode }) => {
      try {
        const results = await engine.search(query, {
          topK: top_k ?? 5,
          threshold: threshold ?? 0.35,
          statusFilter: status ? [status.toLowerCase()] : undefined,
          sectionType: section === 'all' ? undefined : section,
          mode: mode || 'hybrid',
        });

        const resolver = engine.getRemoteResolver();
        let output = `## ADR Search Results for: "${query}" (Mode: ${mode || 'hybrid'})\n\n`;

        if (results.length === 0) {
          output += `No ADRs matched your query above the similarity threshold.\n`;
        } else {
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            output += `### ${i + 1}. [ADR-${r.id}] ${r.title}\n`;
            output += `- **Status:** ${r.status}\n`;
            output += `- **Combined Relevance:** ${Math.round(r.score * 100)}%\n`;
            if (r.denseScore !== undefined || r.sparseScore !== undefined) {
              const denseStr = r.denseScore !== undefined ? `${Math.round(r.denseScore * 100)}%` : 'N/A';
              const sparseStr = r.sparseScore !== undefined ? r.sparseScore.toFixed(2) : 'N/A';
              output += `- **Attribution:** Dense (Semantic): ${denseStr} | BM25 (Keyword): ${sparseStr}\n`;
            }
            if (r.matchedTerms && r.matchedTerms.length > 0) {
              output += `- **Matched Vocabulary Terms:** ${r.matchedTerms.join(', ')}\n`;
            }
            if (resolver) {
              const urls = resolver.resolveUrls(r.id, r.metadata.id);
              output += `- **Web Link:** ${urls.webUrl}\n`;
            } else {
              output += `- **File Path:** \`${r.filePath}\`\n`;
            }
            output += `- **Matched Section:** ${r.matchedSection}\n`;
            output += `- **Excerpt:**\n> ${r.excerpt.replace(/\n/g, '\n> ')}\n\n`;
          }
        }

        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error searching ADRs: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  // Tool: get_adr
  server.tool(
    'get_adr',
    'Retrieve full parsed structured metadata, context, decision rationale, and architecture diagrams for a specific ADR by ID.',
    {
      id: z.string().describe('ADR identifier (e.g. "0001", "ADR-001", or file path)'),
    },
    async ({ id }) => {
      const doc = engine.getAdr(id);
      if (!doc) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `ADR "${id}" not found in index. Verify the ID or run index_adrs / fetch_adr_index.`,
            },
          ],
        };
      }

      const resolver = engine.getRemoteResolver();
      let output = `# ADR-${doc.id}: ${doc.metadata.title}\n\n`;
      output += `- **Status:** ${doc.metadata.status}\n`;
      if (resolver) {
        const urls = resolver.resolveUrls(doc.id, doc.relativePath || doc.filePath);
        output += `- **Web Link:** ${urls.webUrl}\n`;
        output += `- **Raw Source:** ${urls.rawUrl}\n`;
      }
      if (doc.metadata.date) output += `- **Date:** ${doc.metadata.date}\n`;
      if (doc.metadata.category) output += `- **Category:** ${doc.metadata.category}\n`;
      if (doc.metadata.deciders) output += `- **Deciders:** ${doc.metadata.deciders.join(', ')}\n`;
      if (doc.metadata.technicalStory) output += `- **Technical Story:** ${doc.metadata.technicalStory}\n`;
      if (doc.metadata.supersedes) output += `- **Supersedes:** ADR-${doc.metadata.supersedes.join(', ADR-')}\n`;
      if (doc.metadata.supersededBy) output += `- **Superseded By:** ADR-${doc.metadata.supersededBy.join(', ADR-')}\n`;
      if (doc.metadata.extends) output += `- **Extends:** ADR-${doc.metadata.extends.join(', ADR-')}\n`;
      if (doc.metadata.amends) output += `- **Amends:** ADR-${doc.metadata.amends.join(', ADR-')}\n`;
      output += `- **File Path:** \`${doc.filePath}\`\n\n`;

      if (doc.sections.context) {
        output += `## Context and Problem Statement\n${doc.sections.context}\n\n`;
      }
      if (doc.sections.decisionDrivers) {
        output += `## Decision Drivers\n${doc.sections.decisionDrivers}\n\n`;
      }
      if (doc.sections.consideredOptions) {
        output += `## Considered Options\n${doc.sections.consideredOptions}\n\n`;
      }
      if (doc.sections.decision) {
        output += `## Decision Outcome\n${doc.sections.decision}\n\n`;
      }
      if (doc.sections.consequences) {
        output += `## Consequences\n${doc.sections.consequences}\n\n`;
      }
      if (doc.sections.diagrams && doc.sections.diagrams.length > 0) {
        output += `## Architecture Diagrams\n`;
        for (const diag of doc.sections.diagrams) {
          output += `\`\`\`mermaid\n${diag}\n\`\`\`\n\n`;
        }
      }

      return {
        content: [{ type: 'text', text: output }],
      };
    }
  );

  // Tool: list_adrs
  server.tool(
    'list_adrs',
    'List all indexed Architecture Decision Records with their status, identifiers, dates, and lineage relations.',
    {
      status: z.string().optional().describe('Filter by status (e.g. "proposed", "accepted", "superseded")'),
    },
    async ({ status }) => {
      let docs = engine.listAdrs();

      if (status) {
        docs = docs.filter((d) => d.metadata.status.toLowerCase() === status.toLowerCase());
      }

      let output = `## Indexed ADR Catalog (${docs.length} records)\n\n`;
      output += `| ID | Title | Status | Date | Relations |\n`;
      output += `| :--- | :--- | :--- | :--- | :--- |\n`;

      for (const doc of docs) {
        const relations: string[] = [];
        if (doc.metadata.supersedes && doc.metadata.supersedes.length > 0) {
          relations.push(`supersedes [${doc.metadata.supersedes.join(',')}]`);
        }
        if (doc.metadata.extends && doc.metadata.extends.length > 0) {
          relations.push(`extends [${doc.metadata.extends.join(',')}]`);
        }
        if (doc.metadata.amends && doc.metadata.amends.length > 0) {
          relations.push(`amends [${doc.metadata.amends.join(',')}]`);
        }
        output += `| **${doc.id}** | ${doc.metadata.title} | ${doc.metadata.status} | ${doc.metadata.date || '-'} | ${relations.join(', ') || '-'} |\n`;
      }

      return {
        content: [{ type: 'text', text: output }],
      };
    }
  );

  // ==========================================
  // AUTHORING TOOLS (progressive disclosure)
  // ==========================================
  if (isAuthor) {
    // Tool: check_adr_overlap
    server.tool(
      'check_adr_overlap',
      'Checks a proposed or draft ADR against indexed records to detect duplicate decisions, conflicting directions, or extension targets before creating a new ADR.',
      {
        title: z.string().describe('Proposed title of the draft ADR'),
        context: z.string().describe('Context, problem statement, or technical story'),
        decision: z.string().describe('Proposed architectural decision outcome and chosen option'),
        options: z.string().optional().describe('Considered options or alternatives evaluated'),
        drivers: z.string().optional().describe('Decision drivers or evaluation criteria'),
        threshold: z.number().optional().describe('Similarity cutoff threshold (default 0.50)'),
        top_k: z.number().optional().describe('Maximum matches to evaluate (default 5)'),
      },
      async ({ title, context, decision, options, drivers, threshold, top_k }) => {
        try {
          const analysis = await engine.checkOverlap(
            { title, context, decision, options, drivers },
            { threshold, topK: top_k }
          );

          let output = `## ADR Overlap Analysis Verdict: ${analysis.verdict}\n\n`;
          output += `Confidence: ${Math.round(analysis.confidence * 100)}%\n\n`;
          output += `### Summary\n${analysis.summary}\n\n`;

          output += `### Actionable Guidance\n`;
          for (const item of analysis.actionableGuidance) {
            output += `- ${item}\n`;
          }
          output += '\n';

          if (analysis.topMatches.length > 0) {
            output += `### Top Matching ADRs\n\n`;
            for (const m of analysis.topMatches) {
              output += `#### ADR-${m.adrId}: ${m.title} (${m.status})\n`;
              output += `- **Verdict:** ${m.verdict}\n`;
              output += `- **Similarities:** Overall ${Math.round(m.overallSimilarity * 100)}%, Context ${Math.round(m.contextSimilarity * 100)}%, Decision ${Math.round(m.decisionSimilarity * 100)}%\n`;
              if (m.sharedEntities && m.sharedEntities.length > 0) {
                output += `- **Shared Entities:** ${m.sharedEntities.join(', ')}\n`;
              }
              if (m.matchedTerms && m.matchedTerms.length > 0) {
                output += `- **Key Attributed Terms:** ${m.matchedTerms.join(', ')}\n`;
              }
              output += `- **File:** \`${m.filePath}\`\n`;
              output += `- **Recommendation:** ${m.recommendation}\n`;
              output += `- **Excerpt:**\n> ${m.matchedExcerpt.replace(/\n/g, '\n> ')}\n\n`;
            }
          } else {
            output += `No existing ADRs exceeded the similarity threshold.\n`;
          }

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error during ADR overlap analysis: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: index_adrs
    server.tool(
      'index_adrs',
      'Index or re-index directories containing ADR markdown files, using incremental hash caching.',
      {
        directories: z.array(z.string()).optional().describe('Directories to scan (defaults to configured or discovered paths)'),
        force: z.boolean().optional().describe('Force re-indexing and ignore embedding cache (default false)'),
      },
      async ({ directories, force }) => {
        try {
          const targetDirs = directories && directories.length > 0
            ? directories.map((d) => resolve(d))
            : adrDirs;

          if (targetDirs.length === 0) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: 'No ADR directories specified or discovered. Provide paths or set ADR_DIRS environment variable.',
                },
              ],
            };
          }

          const stats = await engine.indexDirectories(targetDirs, { force });

          let output = `## ADR Indexing Completed\n\n`;
          output += `- **Directories Scanned:** ${targetDirs.map((d) => `\`${d}\``).join(', ')}\n`;
          output += `- **Total Files:** ${stats.totalFiles}\n`;
          output += `- **Newly Indexed / Updated:** ${stats.indexedFiles}\n`;
          output += `- **Cached (Unchanged):** ${stats.cachedFiles}\n`;
          output += `- **Total Vector Chunks:** ${stats.totalChunks}\n`;
          output += `- **Duration:** ${stats.durationMs}ms\n`;

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error indexing ADR directories: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: adr_graph_lineage
    server.tool(
      'adr_graph_lineage',
      'Traverses decision supersession and replacement lineage for an ADR. Resolves active successor standard, obsolete predecessors, and chronological timeline.',
      {
        id: z.string().describe('ADR identifier to trace lineage for (e.g. "0001", "ADR-001")'),
      },
      async ({ id }) => {
        try {
          const report = engine.getLineage(id);

          let output = `## Lineage Report for ADR-${report.targetId}\n\n`;
          output += `- **Active Canonical Standard:** ADR-${report.activeStandardId}\n`;
          output += `- **Is Target Active?:** ${report.isActive ? 'YES' : 'NO (Superseded)'}\n`;
          output += `- **Summary:** ${report.summary}\n\n`;

          if (report.ancestors.length > 0) {
            output += `### Predecessors Obsoleted\n`;
            for (const anc of report.ancestors) {
              output += `- ADR-${anc}\n`;
            }
            output += '\n';
          }

          if (report.successors.length > 0) {
            output += `### Successor Chain\n`;
            for (const succ of report.successors) {
              output += `- ADR-${succ}\n`;
            }
            output += '\n';
          }

          if (report.timeline.length > 0) {
            output += `### Chronological Supersession Timeline\n`;
            for (let i = 0; i < report.timeline.length; i++) {
              const step = report.timeline[i];
              output += `${i + 1}. ADR-${step.fromId} ${step.relation} ADR-${step.toId}${step.date ? ` (${step.date})` : ''}\n`;
            }
            output += '\n';
          }

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error resolving lineage for ADR "${id}": ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: adr_graph_impact
    server.tool(
      'adr_graph_impact',
      'Calculates downstream blast radius and impact for an ADR. Identifies direct dependents, transitive dependents, and specialized extensions.',
      {
        id: z.string().describe('ADR identifier to evaluate impact for (e.g. "0001", "ADR-001")'),
      },
      async ({ id }) => {
        try {
          const impact = engine.getImpact(id);

          let output = `## Architectural Impact Analysis: ADR-${impact.targetId} ("${impact.targetTitle}")\n\n`;
          output += `- **Blast Radius Score:** ${impact.blastRadiusScore.toFixed(1)} / 10.0\n`;
          output += `- **Direct Dependents:** ${impact.directDependents.length}\n`;
          output += `- **Specializing Extensions:** ${impact.extensions.length}\n`;
          output += `- **Transitive Downstream Decisions:** ${impact.transitiveDependents.length}\n`;
          output += `- **Citations & References:** ${impact.citations.length}\n\n`;

          if (impact.advisory.length > 0) {
            output += `### Strategic Advisories\n`;
            for (const adv of impact.advisory) {
              output += `- ${adv}\n`;
            }
            output += '\n';
          }

          if (impact.directDependents.length > 0) {
            output += `### Direct Downstream Dependents (${impact.directDependents.length})\n`;
            for (const dep of impact.directDependents) {
              output += `- **ADR-${dep.id}**: ${dep.title} (${dep.relation})\n`;
            }
            output += '\n';
          }

          if (impact.extensions.length > 0) {
            output += `### Specializing Extensions & Amendments (${impact.extensions.length})\n`;
            for (const ext of impact.extensions) {
              output += `- **ADR-${ext.id}**: ${ext.title} (${ext.relation})\n`;
            }
            output += '\n';
          }

          if (impact.transitiveDependents.length > 0) {
            output += `### Transitive Downstream Records (${impact.transitiveDependents.length})\n`;
            for (const t of impact.transitiveDependents) {
              output += `- **ADR-${t.id}**: ${t.title} (Dependency Depth: ${t.depth})\n`;
            }
            output += '\n';
          }

          if (impact.citations.length > 0) {
            output += `### Citations & Informational References (${impact.citations.length})\n`;
            for (const c of impact.citations) {
              output += `- **ADR-${c.id}**: ${c.title}\n`;
            }
            output += '\n';
          }

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error analyzing impact for ADR "${id}": ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: adr_graph_dependencies
    server.tool(
      'adr_graph_dependencies',
      'Resolves upstream architectural dependencies in topological order. Checks for prerequisite decisions and flags deprecated or superseded prerequisites.',
      {
        id: z.string().describe('ADR identifier to evaluate upstream prerequisites for'),
      },
      async ({ id }) => {
        try {
          const result = engine.getDependencies(id);

          let output = `## Upstream Architectural Dependencies: ADR-${result.targetId}\n\n`;
          if (result.hasDeprecatedPrerequisite) {
            output += `> [!WARNING]\n> This ADR depends on one or more prerequisites that are currently marked deprecated or superseded. Review upstream decisions before implementation.\n\n`;
          }

          if (result.dependencies.length === 0) {
            output += `No upstream prerequisite decisions recorded. This is a foundational architectural decision.\n`;
          } else {
            output += `### Prerequisite Evaluation Order (${result.dependencies.length} dependencies)\n\n`;
            for (let i = 0; i < result.dependencies.length; i++) {
              const dep = result.dependencies[i];
              output += `${i + 1}. **ADR-${dep.id}**: ${dep.title} [Status: ${dep.status}, Relation: ${dep.relation}, Depth: ${dep.depth}]\n`;
            }
          }

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error evaluating dependencies for ADR "${id}": ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: adr_graph_validate
    server.tool(
      'adr_graph_validate',
      'Validates architectural graph integrity: detects dangling references, circular dependencies or obsoletion loops, split-brain status contradictions, and unharmonized heritage records.',
      {},
      async () => {
        try {
          const report = engine.validateGraph();

          let output = `## ADR Knowledge Graph Validation Report\n\n`;
          output += `- **Status:** ${report.valid ? 'VALID' : 'INVALID'}\n`;
          output += `- **Nodes Evaluated:** ${report.totalNodes}\n`;
          output += `- **Edges Evaluated:** ${report.totalEdges}\n`;
          output += `- **Errors:** ${report.errors.length}\n`;
          output += `- **Warnings:** ${report.warnings.length}\n`;
          output += `- **Summary:** ${report.summary}\n\n`;

          if (report.errors.length > 0) {
            output += `### Fatal Integrity Errors (${report.errors.length})\n\n`;
            for (let i = 0; i < report.errors.length; i++) {
              const err = report.errors[i];
              output += `#### ${i + 1}. [${err.code}] ${err.message}\n`;
              output += `- **Involved ADRs:** ${err.nodeIds.map((n) => `ADR-${n}`).join(', ')}\n`;
              output += `- **Required Remediation:** ${err.remediation}\n\n`;
            }
          }

          if (report.warnings.length > 0) {
            output += `### Architectural Smells & Warnings (${report.warnings.length})\n\n`;
            for (let i = 0; i < report.warnings.length; i++) {
              const warn = report.warnings[i];
              output += `#### ${i + 1}. [${warn.code}] ${warn.message}\n`;
              output += `- **Involved ADRs:** ${warn.nodeIds.map((n) => `ADR-${n}`).join(', ')}\n`;
              output += `- **Suggested Remediation:** ${warn.remediation}\n\n`;
            }
          }

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error validating ADR knowledge graph: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: adr_graph_mermaid
    server.tool(
      'adr_graph_mermaid',
      'Generates a clean Mermaid diagram visualizing ADR lineage, dependencies, and extensions adhering to documentation standards.',
      {
        focus_id: z.string().optional().describe('Focus ADR identifier to render localized neighborhood (default: all nodes)'),
        radius: z.number().optional().describe('Neighborhood radius around focus ADR (default: 1)'),
      },
      async ({ focus_id, radius }) => {
        try {
          const mermaid = engine.getGraphMermaid({ focusId: focus_id, radius });
          const output = `## ADR Relationship Topology\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`;
          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error rendering Mermaid graph: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );

    // Tool: list_adr_vocabulary
    server.tool(
      'list_adr_vocabulary',
      'Lists technical terms and domain vocabulary harvested in-situ from repository ADRs, with document frequencies, occurrence counts, and declaring sources.',
      {
        min_docs: z.number().optional().describe('Minimum document frequency threshold (default 1)'),
        limit: z.number().optional().describe('Maximum terms to return (default 50)'),
      },
      async ({ min_docs, limit }) => {
        try {
          const terms = engine.getVocabulary();
          const minDocs = min_docs ?? 1;
          const maxLimit = limit ?? 50;

          const filtered = terms
            .filter((t) => t.docCount >= minDocs)
            .slice(0, maxLimit);

          let output = `## In-Situ Architectural Vocabulary (${filtered.length} terms shown, ${terms.length} total)\n\n`;
          if (filtered.length === 0) {
            output += `No technical terms matched the threshold min_docs=${minDocs}.\n`;
          } else {
            for (let i = 0; i < filtered.length; i++) {
              const t = filtered[i];
              output += `${i + 1}. **${t.displayName}** (\`${t.term}\`)\n`;
              output += `   - **Documents:** ${t.docCount} records (${t.docIds.slice(0, 5).join(', ')}${t.docIds.length > 5 ? '...' : ''})\n`;
              output += `   - **Total Occurrences:** ${t.totalOccurrences}\n`;
              output += `   - **Declared By:** ${t.sources.join(', ')}\n\n`;
            }
          }

          return {
            content: [{ type: 'text', text: output }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error listing vocabulary: ${(error as Error).message}`,
              },
            ],
          };
        }
      }
    );
  }

  // ==========================================
  // MCP RESOURCES
  // ==========================================
  server.resource(
    'adr-catalog',
    'adr://catalog',
    async (uri) => {
      const all = engine.listAdrs();
      const catalog = all.map((d) => ({
        id: d.id,
        title: d.metadata.title,
        status: d.metadata.status,
        date: d.metadata.date,
        deciders: d.metadata.deciders,
        filePath: d.filePath,
        relations: {
          supersedes: d.metadata.supersedes,
          supersededBy: d.metadata.supersededBy,
          extends: d.metadata.extends,
          amends: d.metadata.amends,
        },
      }));

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(catalog, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'adr-document',
    new ResourceTemplate('adr://file/{id}', { list: undefined }),
    async (uri, { id }) => {
      const doc = engine.getAdr(id as string);
      if (!doc) {
        throw new Error(`ADR with ID ${id} not found`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: doc.rawContent,
          },
        ],
      };
    }
  );

  server.resource(
    'adr-graph-validation',
    'adr://graph/validation',
    async (uri) => {
      const report = engine.validateGraph();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'adr-graph-lineage',
    new ResourceTemplate('adr://graph/lineage/{id}', { list: undefined }),
    async (uri, { id }) => {
      const report = engine.getLineage(id as string);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'adr-graph-impact',
    new ResourceTemplate('adr://graph/impact/{id}', { list: undefined }),
    async (uri, { id }) => {
      const report = engine.getImpact(id as string);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    'adr-vocabulary',
    'adr://vocabulary',
    async (uri) => {
      const terms = engine.getVocabulary();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(terms, null, 2),
          },
        ],
      };
    }
  );

  // ==========================================
  // MCP PROMPT TEMPLATES
  // ==========================================
  if (isAuthor) {
    server.prompt(
      'check_draft_adr',
      'Template prompt for checking prior art before authoring a new ADR',
      {
        title: z.string().describe('Proposed ADR title'),
        problem_statement: z.string().describe('Problem statement and background context'),
        proposed_decision: z.string().describe('Proposed architectural decision'),
      },
      ({ title, problem_statement, proposed_decision }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please evaluate whether our architecture catalog already addresses this problem before writing a new ADR:\n\nTitle: ${title}\nProblem Context: ${problem_statement}\nProposed Decision: ${proposed_decision}\n\nRun the 'check_adr_overlap' tool and evaluate if we should enrich an existing ADR, mark this as an extension, or proceed with a new record.`,
            },
          },
        ],
      })
    );
  }

  if (isConstruct) {
    server.prompt(
      'review_changeset_against_adrs',
      'Template prompt for reviewing a code changeset against published architecture decisions',
      {
        ref: z.string().optional().describe('Git branch or revision range (e.g. "origin/main...HEAD")'),
        summary: z.string().optional().describe('Brief description of pull request or changeset intent'),
      },
      ({ ref, summary }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please audit the current code changeset against our published Architecture Decision Records:\n\nGit Ref: ${ref || 'staged/working-tree'}\nPR Summary: ${summary || 'None provided'}\n\nRun the 'align_changeset' tool to identify binding approved standards and proposed advisories. Review if any new code or dependencies diverge from approved decisions.`,
            },
          },
        ],
      })
    );
  }

  return { server, engine, init };
}

export async function runStdioServer(config: McpServerConfig = {}): Promise<void> {
  const { server, init } = createMcpServer(config);
  await init();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('ADR Search MCP server running on stdio transport.\n');
}
