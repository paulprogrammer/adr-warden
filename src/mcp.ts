import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdrEngine } from './engine.js';
import type { AdrStatus, SectionType } from './types.js';

export interface McpServerConfig {
  adrDirs?: string[];
  cacheDir?: string;
  modelName?: string;
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
    './docs/adr',
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

export function createMcpServer(config: McpServerConfig = {}): {
  server: McpServer;
  engine: AdrEngine;
  init: () => Promise<void>;
} {
  const cacheDir = config.cacheDir || process.env.ADR_CACHE_DIR || resolve(process.cwd(), '.adr-cache');
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
    if (adrDirs.length > 0) {
      await engine.indexDirectories(adrDirs);
    }
  };

  // Tool 1: check_adr_overlap
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

  // Tool 2: search_adrs
  server.tool(
    'search_adrs',
    'Semantically search Architecture Decision Records using hybrid dense vector and BM25 sparse matching.',
    {
      query: z.string().describe('Search query or architectural question'),
      top_k: z.number().optional().describe('Maximum results to return (default 5)'),
      threshold: z.number().optional().describe('Minimum similarity threshold (default 0.35)'),
      status: z.string().optional().describe('Filter by ADR status (e.g. proposed, accepted, deprecated, superseded)'),
      section: z.enum(['all', 'summary', 'context', 'decision', 'options']).optional().describe('Target specific section to match'),
      mode: z.enum(['hybrid', 'dense', 'sparse']).optional().describe('Search retrieval mode: hybrid (default: dense vector + BM25 keyword), dense (vector only), or sparse (BM25 keyword only)'),
    },
    async ({ query, top_k, threshold, status, section, mode }) => {
      try {
        const sectionType = section && section !== 'all' ? (section as SectionType) : undefined;
        const results = await engine.search(query, {
          topK: top_k ?? 5,
          threshold: threshold ?? 0.35,
          sectionType,
          statusFilter: status ? [status] : undefined,
          mode,
        });

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No ADRs matched the query "${query}" with similarity threshold ${threshold ?? 0.35}.`,
              },
            ],
          };
        }

        let output = `## Search Results for "${query}" (${results.length} found)\n\n`;
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          output += `### ${i + 1}. ADR-${r.id}: ${r.title}\n`;
          output += `- **Score:** ${(r.score * 100).toFixed(1)}%\n`;
          if (r.denseScore !== undefined || r.sparseScore !== undefined) {
            const denseStr = r.denseScore !== undefined ? `${(r.denseScore * 100).toFixed(1)}%` : 'N/A';
            const sparseStr = r.sparseScore !== undefined ? r.sparseScore.toFixed(2) : 'N/A';
            output += `- **Attribution:** Dense: ${denseStr}, BM25: ${sparseStr}\n`;
          }
          if (r.matchedTerms && r.matchedTerms.length > 0) {
            output += `- **Matched Keywords:** ${r.matchedTerms.join(', ')}\n`;
          }
          output += `- **Status:** ${r.status}\n`;
          output += `- **File:** \`${r.filePath}\`\n`;
          output += `- **Matched Section:** ${r.matchedSection}\n`;
          if (r.metadata.deciders && r.metadata.deciders.length > 0) {
            output += `- **Deciders:** ${r.metadata.deciders.join(', ')}\n`;
          }
          if (r.metadata.extends && r.metadata.extends.length > 0) {
            output += `- **Extends:** ADR-${r.metadata.extends.join(', ADR-')}\n`;
          }
          if (r.metadata.supersedes && r.metadata.supersedes.length > 0) {
            output += `- **Supersedes:** ADR-${r.metadata.supersedes.join(', ADR-')}\n`;
          }
          output += `- **Excerpt:**\n> ${r.excerpt.slice(0, 300).replace(/\n/g, '\n> ')}\n\n`;
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
              text: `Error during ADR search: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 3: get_adr
  server.tool(
    'get_adr',
    'Retrieve complete metadata, context, decision outcome, and consequences for an ADR by ID or file path.',
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
              text: `ADR "${id}" not found in index. Verify the ID or run index_adrs.`,
            },
          ],
        };
      }

      let output = `# ADR-${doc.id}: ${doc.metadata.title}\n\n`;
      output += `- **Status:** ${doc.metadata.status}\n`;
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

  // Tool 4: list_adrs
  server.tool(
    'list_adrs',
    'Lists all indexed Architecture Decision Records with their status, title, and relations.',
    {
      status: z.string().optional().describe('Filter by status (e.g. proposed, accepted, deprecated, superseded)'),
    },
    async ({ status }) => {
      const adrs = engine.listAdrs({ status });

      let output = `## Indexed ADR Catalog (${adrs.length} records)\n\n`;
      output += `| ID | Title | Status | Date | Relations |\n`;
      output += `| :--- | :--- | :--- | :--- | :--- |\n`;

      for (const doc of adrs) {
        const relations: string[] = [];
        if (doc.metadata.supersedes?.length) {
          relations.push(`supersedes [${doc.metadata.supersedes.join(',')}]`);
        }
        if (doc.metadata.extends?.length) {
          relations.push(`extends [${doc.metadata.extends.join(',')}]`);
        }
        if (doc.metadata.amends?.length) {
          relations.push(`amends [${doc.metadata.amends.join(',')}]`);
        }
        output += `| **${doc.id}** | ${doc.metadata.title} | ${doc.metadata.status} | ${doc.metadata.date || '-'} | ${relations.join(', ') || '-'} |\n`;
      }

      return {
        content: [{ type: 'text', text: output }],
      };
    }
  );

  // Tool 5: index_adrs
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

  // Tool 6: adr_graph_lineage
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
              text: `Error traversing lineage for ADR "${id}": ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 7: adr_graph_impact
  server.tool(
    'adr_graph_impact',
    'Performs architectural impact analysis (blast radius) for an ADR. Enumerates direct dependents, specializing extensions, transitive downstream dependents, and citations.',
    {
      id: z.string().describe('ADR identifier to evaluate impact for (e.g. "0001", "ADR-001")'),
    },
    async ({ id }) => {
      try {
        const impact = engine.getImpact(id);

        let output = `## Architectural Impact Analysis: ADR-${impact.targetId}\n\n`;
        output += `**Title:** ${impact.targetTitle}\n`;
        output += `**Blast Radius Score:** ${impact.blastRadiusScore.toFixed(1)}\n\n`;

        output += `### Operational Advisories\n`;
        for (const adv of impact.advisory) {
          output += `- ${adv}\n`;
        }
        output += '\n';

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

  // Tool 8: adr_graph_dependencies
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

  // Tool 9: adr_graph_validate
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

  // Tool 10: adr_graph_mermaid
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

  // Tool 11: list_adr_vocabulary
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

  // Resource 1: adr://catalog
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

  // Resource 2: adr://file/{id}
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

  // Resource 3: adr://graph/validation
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

  // Resource 4: adr://graph/lineage/{id}
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

  // Resource 5: adr://graph/impact/{id}
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

  // Resource 6: adr://vocabulary
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

  // Prompt 1: check_draft_adr
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
            text: `Please evaluate whether our architecture catalog already addresses this problem before writing a new ADR:

Title: ${title}
Problem Context: ${problem_statement}
Proposed Decision: ${proposed_decision}

Run the 'check_adr_overlap' tool and evaluate if we should enrich an existing ADR, mark this as an extension, or proceed with a new record.`,
          },
        },
      ],
    })
  );

  return { server, engine, init };
}

export async function runStdioServer(config: McpServerConfig = {}): Promise<void> {
  const { server, init } = createMcpServer(config);
  await init();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('ADR Search MCP server running on stdio transport.\n');
}
