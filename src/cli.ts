#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AdrEngine } from './engine.js';
import { parseAdrMarkdown } from './parser.js';
import { runStdioServer, discoverDefaultAdrDirs } from './mcp.js';
import { loadWardenConfig } from './config.js';
import { createRemoteResolver } from './remote/resolver.js';
import { SkillsInstaller } from './skills-installer.js';
import { getWardenVersion } from './version.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'mcp') {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        mode: { type: 'string', short: 'm' },
        index: { type: 'string', short: 'i' },
      },
      allowPositionals: true,
    });

    const mcpConfig = loadWardenConfig();
    if (values.mode) {
      mcpConfig.mode = values.mode as any;
    }
    if (values.index) {
      mcpConfig.indexUrl = values.index;
    }

    await runStdioServer(mcpConfig);
    return;
  }

  const wardenConfig = loadWardenConfig();
  const cacheDir =
    wardenConfig.cacheDir ||
    process.env.ADR_CACHE_DIR ||
    resolve(process.cwd(), '.adr-cache');

  const engine = new AdrEngine({ cacheDir });

  if (wardenConfig.remote) {
    engine.setRemoteResolver(createRemoteResolver(wardenConfig.remote));
  }

  switch (command) {
    case 'install-skills':
    case 'skills': {
      const isSub = command === 'skills';
      const subAction = isSub ? args[1] : 'install';
      const rawArgs = isSub ? args.slice(2) : args.slice(1);

      if (isSub && subAction !== 'install' && subAction !== 'list') {
        process.stderr.write('Usage: warden skills install [options] or warden install-skills [options]\\n');
        process.exit(1);
      }

      const { values } = parseArgs({
        args: rawArgs,
        options: {
          target: { type: 'string', short: 't' },
          ref: { type: 'string', short: 'r' },
          repo: { type: 'string' },
          token: { type: 'string' },
          gemini: { type: 'boolean', short: 'g' },
          force: { type: 'boolean', short: 'f' },
          local: { type: 'boolean', short: 'l' },
        },
        allowPositionals: true,
      });

      const version = getWardenVersion();
      process.stdout.write(`ADR Warden v${version}: Installing version-aligned agent skills...\\n\\n`);

      try {
        const result = await SkillsInstaller.install({
          targetDir: values.target,
          ref: values.ref,
          repo: values.repo,
          token: values.token,
          includeGemini: values.gemini,
          force: values.force ?? true,
          localFallback: values.local ?? true,
          onProgress: (msg) => process.stdout.write(`  ${msg}\\n`),
        });

        process.stdout.write(`\\n✅ Successfully installed ${result.installedSkills.length} skills to ${result.targetDir}\\n`);
        process.stdout.write(`   Source: ${result.downloadedFromGitHub ? `GitHub (${result.sourceRef})` : result.sourceRef}\\n`);
        process.stdout.write(`   Skills: ${result.installedSkills.join(', ')}\\n`);
        process.stdout.write(`   Files written: ${result.filesWritten.length}\\n`);
        if (result.skippedFiles.length > 0) {
          process.stdout.write(`   Files skipped (already exist): ${result.skippedFiles.length}\\n`);
        }
      } catch (err) {
        process.stderr.write(`\\n❌ Error installing skills: ${(err as Error).message}\\n`);
        process.exit(1);
      }
      break;
    }

    case 'align': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          index: { type: 'string', short: 'i' },
          diff: { type: 'string', short: 'd' },
          staged: { type: 'boolean', short: 's' },
          summary: { type: 'string' },
          threshold: { type: 'string', short: 't' },
          json: { type: 'boolean' },
          config: { type: 'string', short: 'c' },
          'fail-on-noncompliance': { type: 'boolean' },
        },
        allowPositionals: true,
      });

      const explicitConfig = values.config ? loadWardenConfig(values.config) : wardenConfig;
      if (explicitConfig.remote) {
        engine.setRemoteResolver(createRemoteResolver(explicitConfig.remote));
      }

      const indexTarget =
        values.index ||
        explicitConfig.indexUrl ||
        explicitConfig.remote?.indexUrl;

      if (indexTarget) {
        process.stdout.write(`Synchronizing ADR index from ${indexTarget}...\\n`);
        const res = await engine.loadRemoteIndex(indexTarget, {
          token: explicitConfig.remote?.token,
        });
        process.stdout.write(
          `Index loaded: ${res.count} records (${res.fromCache ? 'from cache' : 'freshly downloaded'}).\\n\\n`
        );
      } else if (engine.getVectorStore().getDocumentCount() === 0) {
        // Auto-index if local ADR directories exist
        const defaultDirs = discoverDefaultAdrDirs(explicitConfig.adrDirs);
        if (defaultDirs.length > 0) {
          process.stdout.write(`Index empty. Auto-indexing ${defaultDirs.join(', ')}...\\n`);
          await engine.indexDirectories(defaultDirs);
        } else {
          process.stderr.write(
            'Error: No ADR index available. Specify --index <url-or-path> or configure .wardenrc.json with remote/indexUrl.\\n'
          );
          process.exit(1);
        }
      }

      const threshold = values.threshold ? parseFloat(values.threshold) : explicitConfig.rules?.threshold ?? 0.32;
      const report = await engine.alignChangeset(
        {
          diffRef: values.diff,
          staged: values.staged,
          summary: values.summary,
        },
        { threshold }
      );

      if (values.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\\n');
        return;
      }

      process.stdout.write('=======================================================\\n');
      process.stdout.write('🔍 ARCHITECTURAL DECISION ALIGNMENT REPORT\\n');
      process.stdout.write('=======================================================\\n\\n');

      process.stdout.write(`Target Changeset: ${report.targetChangeset.filesCount} files changed`);
      if (report.targetChangeset.dependenciesCount > 0) {
        process.stdout.write(`, ${report.targetChangeset.dependenciesCount} dependencies touched`);
      }
      process.stdout.write('\\n');
      process.stdout.write(`Summary: ${report.summary}\\n\\n`);

      if (report.bindingStandards.length > 0) {
        process.stdout.write('-------------------------------------------------------\\n');
        process.stdout.write(`🔴 BINDING ARCHITECTURAL STANDARDS (${report.bindingStandards.length})\\n`);
        process.stdout.write('-------------------------------------------------------\\n\\n');

        for (const m of report.bindingStandards) {
          process.stdout.write(`[ADR-${m.adrId}] ${m.title} (Status: ${m.status.toUpperCase()})\\n`);
          process.stdout.write(`  • Relevance: ${(m.score * 100).toFixed(1)}%\\n`);
          if (m.webUrl) {
            process.stdout.write(`  • Web Link: ${m.webUrl}\\n`);
          }
          if (m.matchedFiles.length > 0) {
            process.stdout.write(`  • Governs Files: ${m.matchedFiles.join(', ')}\\n`);
          }
          if (m.matchedKeywords.length > 0) {
            process.stdout.write(`  • Topics: ${m.matchedKeywords.join(', ')}\\n`);
          }
          process.stdout.write(`  • Mandatory Decision:\\n    "${m.decision.slice(0, 200).replace(/\\n/g, ' ')}..."\\n`);
          for (const obs of m.observations) {
            process.stdout.write(`  ⚠️  ${obs}\\n`);
          }
          process.stdout.write('\\n');
        }
      }

      if (report.inFlightProposals.length > 0) {
        process.stdout.write('-------------------------------------------------------\\n');
        process.stdout.write(`🟡 IN-FLIGHT PROPOSALS (Heads-Up Advisory) (${report.inFlightProposals.length})\\n`);
        process.stdout.write('-------------------------------------------------------\\n\\n');

        for (const m of report.inFlightProposals) {
          process.stdout.write(`[ADR-${m.adrId}] (PROPOSED) ${m.title}\\n`);
          process.stdout.write(`  • Relevance: ${(m.score * 100).toFixed(1)}%\\n`);
          if (m.webUrl) {
            process.stdout.write(`  • Web Link: ${m.webUrl}\\n`);
          }
          if (m.matchedFiles.length > 0) {
            process.stdout.write(`  • Intersects Files: ${m.matchedFiles.join(', ')}\\n`);
          }
          process.stdout.write(`  • Proposed Direction:\\n    "${m.decision.slice(0, 200).replace(/\\n/g, ' ')}..."\\n`);
          for (const obs of m.observations) {
            process.stdout.write(`  💡 ${obs}\\n`);
          }
          process.stdout.write('\\n');
        }
      }

      if (report.historicalMatches.length > 0) {
        process.stdout.write('-------------------------------------------------------\\n');
        process.stdout.write(`📜 HISTORICAL RECORDS (${report.historicalMatches.length})\\n`);
        process.stdout.write('-------------------------------------------------------\\n\\n');

        for (const m of report.historicalMatches) {
          process.stdout.write(`[ADR-${m.adrId}] ${m.title} [Status: ${m.status.toUpperCase()}]\\n`);
          for (const obs of m.observations) {
            process.stdout.write(`  ℹ️  ${obs}\\n`);
          }
          process.stdout.write('\\n');
        }
      }

      if (
        report.bindingStandards.length === 0 &&
        report.inFlightProposals.length === 0
      ) {
        process.stdout.write('✅ All clear! No binding architectural conflicts or pending proposals detected.\\n\\n');
      }

      if (values['fail-on-noncompliance'] && report.bindingStandards.length > 0) {
        process.stderr.write('Failure: Changeset intersects with binding architectural standards.\\n');
        process.exit(1);
      }
      break;
    }

    case 'index': {
      const dirs = args.slice(1);
      const targetDirs = dirs.length > 0 ? dirs.map((d) => resolve(d)) : discoverDefaultAdrDirs(wardenConfig.adrDirs);

      if (targetDirs.length === 0) {
        process.stderr.write(
          'Error: No ADR directories specified or discovered. Specify directories: warden index <dir1> <dir2>\\n'
        );
        process.exit(1);
      }

      process.stdout.write(`Indexing ADRs from: ${targetDirs.join(', ')}...\\n`);
      const stats = await engine.indexDirectories(targetDirs);
      process.stdout.write(
        `Indexing complete in ${stats.durationMs}ms: ${stats.totalFiles} files scanned, ${stats.indexedFiles} newly indexed/updated, ${stats.cachedFiles} cached, ${stats.totalChunks} chunks.\\n`
      );
      break;
    }

    case 'search': {
      const { values, positionals } = parseArgs({
        args: args.slice(1),
        options: {
          mode: { type: 'string', short: 'm' },
          'top-k': { type: 'string', short: 'k' },
          threshold: { type: 'string', short: 't' },
        },
        allowPositionals: true,
      });

      const query = positionals.join(' ').trim();
      if (!query) {
        process.stderr.write('Error: Search query required: warden search "query" [--mode hybrid|dense|sparse]\\n');
        process.exit(1);
      }

      // Auto-index if vector store is empty
      if (engine.getVectorStore().getDocumentCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs(wardenConfig.adrDirs);
        if (defaultDirs.length > 0) {
          process.stdout.write(`Index empty. Auto-indexing ${defaultDirs.join(', ')}...\\n`);
          await engine.indexDirectories(defaultDirs);
        }
      }

      const mode = (values.mode as 'hybrid' | 'dense' | 'sparse') || 'hybrid';
      const topK = values['top-k'] ? parseInt(values['top-k'], 10) : 5;
      const threshold = values.threshold ? parseFloat(values.threshold) : undefined;

      const results = await engine.search(query, { topK, threshold, mode });
      if (results.length === 0) {
        process.stdout.write(`No ADRs matched "${query}".\\n`);
        return;
      }

      process.stdout.write(`\\nTop matches for "${query}" (mode: ${mode}):\\n\\n`);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        process.stdout.write(
          `${i + 1}. [ADR-${r.id}] ${r.title} (Match: ${(r.score * 100).toFixed(1)}%, Status: ${r.status})\\n`
        );
        if (r.denseScore !== undefined || r.sparseScore !== undefined) {
          const denseStr = r.denseScore !== undefined ? `${(r.denseScore * 100).toFixed(1)}%` : 'N/A';
          const sparseStr = r.sparseScore !== undefined ? r.sparseScore.toFixed(2) : 'N/A';
          process.stdout.write(`   Attribution: Dense ${denseStr}, BM25 ${sparseStr}\\n`);
        }
        if (r.matchedTerms && r.matchedTerms.length > 0) {
          process.stdout.write(`   Matched Keywords: ${r.matchedTerms.join(', ')}\\n`);
        }
        process.stdout.write(`   File: ${r.filePath}\\n`);
        process.stdout.write(`   Section: ${r.matchedSection}\\n`);
        process.stdout.write(`   Snippet: ${r.excerpt.slice(0, 160).replace(/\\n/g, ' ')}...\\n\\n`);
      }
      break;
    }

    case 'check': {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          file: { type: 'string', short: 'f' },
          title: { type: 'string', short: 't' },
          context: { type: 'string', short: 'c' },
          decision: { type: 'string', short: 'd' },
        },
        allowPositionals: true,
      });

      let draftTitle = values.title || '';
      let draftContext = values.context || '';
      let draftDecision = values.decision || '';

      if (values.file) {
        const filePath = resolve(values.file);
        if (!existsSync(filePath)) {
          process.stderr.write(`Error: File not found: ${filePath}\\n`);
          process.exit(1);
        }
        const parsed = parseAdrMarkdown(filePath);
        draftTitle = parsed.metadata.title;
        draftContext = parsed.sections.context;
        draftDecision = parsed.sections.decision;
      }

      if (!draftTitle && !draftContext && !draftDecision) {
        process.stderr.write(
          'Error: Provide --file <path> or --title, --context, and --decision flags.\\n'
        );
        process.exit(1);
      }

      // Auto-index if vector store is empty
      if (engine.getVectorStore().getDocumentCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs(wardenConfig.adrDirs);
        if (defaultDirs.length > 0) {
          process.stdout.write(`Index empty. Auto-indexing ${defaultDirs.join(', ')}...\\n`);
          await engine.indexDirectories(defaultDirs);
        }
      }

      process.stdout.write(`Evaluating overlap for "${draftTitle}"...\\n\\n`);
      const analysis = await engine.checkOverlap({
        title: draftTitle,
        context: draftContext,
        decision: draftDecision,
      });

      process.stdout.write(`VERDICT: ${analysis.verdict} (Confidence: ${Math.round(analysis.confidence * 100)}%)\\n`);
      process.stdout.write(`SUMMARY: ${analysis.summary}\\n\\n`);

      process.stdout.write('ACTIONABLE GUIDANCE:\\n');
      for (const item of analysis.actionableGuidance) {
        process.stdout.write(`  - ${item}\\n`);
      }
      process.stdout.write('\\n');

      if (analysis.topMatches.length > 0) {
        process.stdout.write('TOP MATCHES:\\n');
        for (const m of analysis.topMatches) {
          process.stdout.write(
            `  * ADR-${m.adrId}: ${m.title} [${m.verdict}] (Overall: ${Math.round(m.overallSimilarity * 100)}%, Context: ${Math.round(m.contextSimilarity * 100)}%, Decision: ${Math.round(m.decisionSimilarity * 100)}%)\\n`
          );
          if (m.sharedEntities && m.sharedEntities.length > 0) {
            process.stdout.write(`    Shared Entities: ${m.sharedEntities.join(', ')}\\n`);
          }
          if (m.matchedTerms && m.matchedTerms.length > 0) {
            process.stdout.write(`    Key Terms: ${m.matchedTerms.join(', ')}\\n`);
          }
          process.stdout.write(`    Path: ${m.filePath}\\n`);
          process.stdout.write(`    Advice: ${m.recommendation}\\n`);
        }
      }
      break;
    }

    case 'list': {
      const all = engine.listAdrs();
      if (all.length === 0) {
        const defaultDirs = discoverDefaultAdrDirs(wardenConfig.adrDirs);
        if (defaultDirs.length > 0) {
          await engine.indexDirectories(defaultDirs);
        }
      }
      const refreshed = engine.listAdrs();
      process.stdout.write(`\\nIndexed ADR Catalog (${refreshed.length} records):\\n\\n`);
      for (const d of refreshed) {
        process.stdout.write(`- ADR-${d.id}: ${d.metadata.title} [${d.metadata.status}] (${d.metadata.date || 'no date'})\\n`);
        process.stdout.write(`  Path: ${d.filePath}\\n`);
      }
      break;
    }

    case 'get': {
      const id = args[1];
      if (!id) {
        process.stderr.write('Error: ADR ID required: warden get <id>\\n');
        process.exit(1);
      }
      const doc = engine.getAdr(id);
      if (!doc) {
        process.stderr.write(`Error: ADR "${id}" not found.\\n`);
        process.exit(1);
      }
      process.stdout.write(`\\nADR-${doc.id}: ${doc.metadata.title}\\n`);
      process.stdout.write(`Status: ${doc.metadata.status}\\n`);
      process.stdout.write(`Path: ${doc.filePath}\\n\\n`);
      process.stdout.write(`--- Context ---\\n${doc.sections.context}\\n\\n`);
      process.stdout.write(`--- Decision ---\\n${doc.sections.decision}\\n`);
      break;
    }

    case 'graph': {
      const sub = args[1];
      const targetId = args[2];

      // Auto-index if vector store or graph is empty
      if (engine.getKnowledgeGraph().getNodeCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs(wardenConfig.adrDirs);
        if (defaultDirs.length > 0) {
          await engine.indexDirectories(defaultDirs);
        }
      }

      if (sub === 'lineage') {
        if (!targetId) {
          process.stderr.write('Error: ADR ID required: warden graph lineage <id>\\n');
          process.exit(1);
        }
        const report = engine.getLineage(targetId);
        process.stdout.write(`\\nLineage Report for ADR-${report.targetId}:\\n`);
        process.stdout.write(`Active Canonical Standard: ADR-${report.activeStandardId} (${report.isActive ? 'Active' : 'Superseded'})\\n`);
        process.stdout.write(`Summary: ${report.summary}\\n\\n`);
        if (report.ancestors.length > 0) {
          process.stdout.write(`Predecessors Obsoleted: ${report.ancestors.map((a) => `ADR-${a}`).join(', ')}\\n`);
        }
        if (report.successors.length > 0) {
          process.stdout.write(`Successor Chain: ${report.successors.map((s) => `ADR-${s}`).join(' -> ')}\\n`);
        }
      } else if (sub === 'impact') {
        if (!targetId) {
          process.stderr.write('Error: ADR ID required: warden graph impact <id>\\n');
          process.exit(1);
        }
        const impact = engine.getImpact(targetId);
        process.stdout.write(`\\nArchitectural Impact Analysis: ADR-${impact.targetId} (\"${impact.targetTitle}\")\\n`);
        process.stdout.write(`Blast Radius Score: ${impact.blastRadiusScore.toFixed(1)}\\n\\n`);
        process.stdout.write('Advisories:\\n');
        for (const adv of impact.advisory) {
          process.stdout.write(`  - ${adv}\\n`);
        }
        if (impact.directDependents.length > 0) {
          process.stdout.write('\\nDirect Dependents:\\n');
          for (const d of impact.directDependents) {
            process.stdout.write(`  * ADR-${d.id}: ${d.title} (${d.relation})\\n`);
          }
        }
        if (impact.extensions.length > 0) {
          process.stdout.write('\\nExtensions & Amendments:\\n');
          for (const e of impact.extensions) {
            process.stdout.write(`  * ADR-${e.id}: ${e.title} (${e.relation})\\n`);
          }
        }
        if (impact.transitiveDependents.length > 0) {
          process.stdout.write('\\nTransitive Dependents:\\n');
          for (const t of impact.transitiveDependents) {
            process.stdout.write(`  * ADR-${t.id}: ${t.title} (Depth: ${t.depth})\\n`);
          }
        }
        if (impact.citations.length > 0) {
          process.stdout.write('\\nCitations & Informational References:\\n');
          for (const c of impact.citations) {
            process.stdout.write(`  * ADR-${c.id}: ${c.title}\\n`);
          }
        }
      } else if (sub === 'deps') {
        if (!targetId) {
          process.stderr.write('Error: ADR ID required: warden graph deps <id>\\n');
          process.exit(1);
        }
        const deps = engine.getDependencies(targetId);
        process.stdout.write(`\\nUpstream Dependencies for ADR-${deps.targetId}:\\n`);
        if (deps.hasDeprecatedPrerequisite) {
          process.stdout.write('WARNING: Depends on deprecated or superseded prerequisites!\\n');
        }
        if (deps.dependencies.length === 0) {
          process.stdout.write('No upstream prerequisites. Foundational decision.\\n');
        } else {
          for (const d of deps.dependencies) {
            process.stdout.write(`  - ADR-${d.id}: ${d.title} [Status: ${d.status}, Relation: ${d.relation}, Depth: ${d.depth}]\\n`);
          }
        }
      } else if (sub === 'validate') {
        const report = engine.validateGraph();
        process.stdout.write(`\\nKnowledge Graph Validation: ${report.valid ? 'VALID' : 'INVALID'}\\n`);
        process.stdout.write(`Nodes: ${report.totalNodes}, Edges: ${report.totalEdges}, Errors: ${report.errors.length}, Warnings: ${report.warnings.length}\\n\\n`);
        if (report.errors.length > 0) {
          process.stdout.write('ERRORS:\\n');
          for (const err of report.errors) {
            process.stdout.write(`  [${err.code}] ${err.message}\\n    Remediation: ${err.remediation}\\n`);
          }
        }
        if (report.warnings.length > 0) {
          process.stdout.write('\\nWARNINGS:\\n');
          for (const warn of report.warnings) {
            process.stdout.write(`  [${warn.code}] ${warn.message}\\n    Remediation: ${warn.remediation}\\n`);
          }
        }
      } else if (sub === 'mermaid') {
        const mermaid = engine.getGraphMermaid({ focusId: targetId });
        process.stdout.write(`\\n\`\`\`mermaid\\n${mermaid}\\n\`\`\`\\n`);
      } else {
        process.stderr.write('Usage: warden graph <validate|lineage|impact|deps|mermaid> [id]\\n');
        process.exit(1);
      }
      break;
    }

    case 'vocab':
    case 'vocabulary': {
      // Auto-index if vector store is empty
      if (engine.getVectorStore().getDocumentCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs(wardenConfig.adrDirs);
        if (defaultDirs.length > 0) {
          process.stdout.write(`Index empty. Auto-indexing ${defaultDirs.join(', ')}...\\n`);
          await engine.indexDirectories(defaultDirs);
        }
      }

      const terms = engine.getVocabulary();
      process.stdout.write(`\\nHarvested In-Situ Architectural Vocabulary (${terms.length} terms):\\n\\n`);
      for (const t of terms.slice(0, 50)) {
        process.stdout.write(`- ${t.displayName} [\`${t.term}\`] (${t.docCount} docs, ${t.totalOccurrences} occurrences, sources: ${t.sources.join(', ')})\\n`);
      }
      break;
    }

    case 'help':
    default: {
      process.stdout.write(`
ADR Warden (warden / adr-warden)
Deterministic vector overlap guard and decision lineage graph for ADRs

Usage:
  warden mcp [--mode <author|construct|all>]  Start MCP server on stdio with progressive disclosure
  warden align [options]                     Audit git changeset against approved and proposed ADRs
  warden install-skills [options]            Install version-aligned agent skills to .agents directory
  warden skills install [options]            Alias for install-skills
  warden index [dir...]                      Index ADR directories with incremental embedding cache
  warden search <query>                      Semantic vector search across indexed ADRs
  warden check --file <path>                 Check a draft ADR file for overlap and duplicate risk
  warden check -t <title> -c <ctx>           Check draft components for overlap
  warden vocabulary                          List canonical technical terms harvested in-situ from ADRs
  warden graph validate                      Validate knowledge graph (cycles, dangling links, split-brain)
  warden graph lineage <id>                  Trace supersession lineage and active replacement chain
  warden graph impact <id>                   Evaluate downstream blast radius and dependents
  warden graph deps <id>                     Inspect upstream dependencies and prerequisites
  warden graph mermaid [id]                  Export Mermaid architecture topology diagram
  warden list                                List all indexed ADRs
  warden get <id>                            View details of an indexed ADR
  warden help                                Show this help message

Install-Skills Options:
  -t, --target <dir>                         Target directory (defaults to .agents/skills)
  -r, --ref <git-ref>                        Git tag or branch (defaults to v<warden-version>)
  --repo <owner/repo>                        GitHub repo (defaults to paulprogrammer/adr-warden)
  --token <token>                            GitHub token for authentication/rate-limits
  -f, --force                                Overwrite existing files (default true)
  -g, --gemini                               Also mirror installed skills to .gemini/skills
  -l, --local                                Fallback to local package skills if offline

Align Options:
  -i, --index <url-or-path>                  Remote URL or local path to index.json
  -d, --diff <git-ref>                       Git ref or revision range to compare (e.g. origin/main...HEAD)
  -s, --staged                               Compare staged git changes only
  --summary <text>                           Pull request description or changeset intent summary
  -t, --threshold <num>                      Relevance threshold cutoff (default 0.32)
  --json                                     Output report in JSON format
  -c, --config <path>                        Path to custom configuration file
  --fail-on-noncompliance                   Exit with code 1 if binding standards are matched
`);
      break;
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${(err as Error).message}\\n`);
  process.exit(1);
});
