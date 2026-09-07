#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AdrEngine } from './engine.js';
import { parseAdrMarkdown } from './parser.js';
import { runStdioServer, discoverDefaultAdrDirs } from './mcp.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'mcp') {
    await runStdioServer();
    return;
  }

  const cacheDir = process.env.ADR_CACHE_DIR || resolve(process.cwd(), '.adr-cache');
  const engine = new AdrEngine({ cacheDir });

  switch (command) {
    case 'index': {
      const dirs = args.slice(1);
      const targetDirs = dirs.length > 0 ? dirs.map((d) => resolve(d)) : discoverDefaultAdrDirs();

      if (targetDirs.length === 0) {
        process.stderr.write(
          'Error: No ADR directories specified or discovered. Specify directories: warden index <dir1> <dir2>\n'
        );
        process.exit(1);
      }

      process.stdout.write(`Indexing ADRs from: ${targetDirs.join(', ')}...\n`);
      const stats = await engine.indexDirectories(targetDirs);
      process.stdout.write(
        `Indexing complete in ${stats.durationMs}ms: ${stats.totalFiles} files scanned, ${stats.indexedFiles} newly indexed/updated, ${stats.cachedFiles} cached, ${stats.totalChunks} chunks.\n`
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
        process.stderr.write('Error: Search query required: warden search "query" [--mode hybrid|dense|sparse]\n');
        process.exit(1);
      }

      // Auto-index if vector store is empty
      if (engine.getVectorStore().getDocumentCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs();
        if (defaultDirs.length > 0) {
          process.stdout.write(`Index empty. Auto-indexing ${defaultDirs.join(', ')}...\n`);
          await engine.indexDirectories(defaultDirs);
        }
      }

      const mode = (values.mode as 'hybrid' | 'dense' | 'sparse') || 'hybrid';
      const topK = values['top-k'] ? parseInt(values['top-k'], 10) : 5;
      const threshold = values.threshold ? parseFloat(values.threshold) : undefined;

      const results = await engine.search(query, { topK, threshold, mode });
      if (results.length === 0) {
        process.stdout.write(`No ADRs matched "${query}".\n`);
        return;
      }

      process.stdout.write(`\nTop matches for "${query}" (mode: ${mode}):\n\n`);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        process.stdout.write(
          `${i + 1}. [ADR-${r.id}] ${r.title} (Match: ${(r.score * 100).toFixed(1)}%, Status: ${r.status})\n`
        );
        if (r.denseScore !== undefined || r.sparseScore !== undefined) {
          const denseStr = r.denseScore !== undefined ? `${(r.denseScore * 100).toFixed(1)}%` : 'N/A';
          const sparseStr = r.sparseScore !== undefined ? r.sparseScore.toFixed(2) : 'N/A';
          process.stdout.write(`   Attribution: Dense ${denseStr}, BM25 ${sparseStr}\n`);
        }
        if (r.matchedTerms && r.matchedTerms.length > 0) {
          process.stdout.write(`   Matched Keywords: ${r.matchedTerms.join(', ')}\n`);
        }
        process.stdout.write(`   File: ${r.filePath}\n`);
        process.stdout.write(`   Section: ${r.matchedSection}\n`);
        process.stdout.write(`   Snippet: ${r.excerpt.slice(0, 160).replace(/\n/g, ' ')}...\n\n`);
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
          process.stderr.write(`Error: File not found: ${filePath}\n`);
          process.exit(1);
        }
        const parsed = parseAdrMarkdown(filePath);
        draftTitle = parsed.metadata.title;
        draftContext = parsed.sections.context;
        draftDecision = parsed.sections.decision;
      }

      if (!draftTitle && !draftContext && !draftDecision) {
        process.stderr.write(
          'Error: Provide --file <path> or --title, --context, and --decision flags.\n'
        );
        process.exit(1);
      }

      // Auto-index if vector store is empty
      if (engine.getVectorStore().getDocumentCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs();
        if (defaultDirs.length > 0) {
          process.stdout.write(`Index empty. Auto-indexing ${defaultDirs.join(', ')}...\n`);
          await engine.indexDirectories(defaultDirs);
        }
      }

      process.stdout.write(`Evaluating overlap for "${draftTitle}"...\n\n`);
      const analysis = await engine.checkOverlap({
        title: draftTitle,
        context: draftContext,
        decision: draftDecision,
      });

      process.stdout.write(`VERDICT: ${analysis.verdict} (Confidence: ${Math.round(analysis.confidence * 100)}%)\n`);
      process.stdout.write(`SUMMARY: ${analysis.summary}\n\n`);

      process.stdout.write('ACTIONABLE GUIDANCE:\n');
      for (const item of analysis.actionableGuidance) {
        process.stdout.write(`  - ${item}\n`);
      }
      process.stdout.write('\n');

      if (analysis.topMatches.length > 0) {
        process.stdout.write('TOP MATCHES:\n');
        for (const m of analysis.topMatches) {
          process.stdout.write(
            `  * ADR-${m.adrId}: ${m.title} [${m.verdict}] (Overall: ${Math.round(m.overallSimilarity * 100)}%, Context: ${Math.round(m.contextSimilarity * 100)}%, Decision: ${Math.round(m.decisionSimilarity * 100)}%)\n`
          );
          if (m.sharedEntities && m.sharedEntities.length > 0) {
            process.stdout.write(`    Shared Entities: ${m.sharedEntities.join(', ')}\n`);
          }
          if (m.matchedTerms && m.matchedTerms.length > 0) {
            process.stdout.write(`    Key Terms: ${m.matchedTerms.join(', ')}\n`);
          }
          process.stdout.write(`    Path: ${m.filePath}\n`);
          process.stdout.write(`    Advice: ${m.recommendation}\n`);
        }
      }
      break;
    }

    case 'list': {
      const all = engine.listAdrs();
      if (all.length === 0) {
        const defaultDirs = discoverDefaultAdrDirs();
        if (defaultDirs.length > 0) {
          await engine.indexDirectories(defaultDirs);
        }
      }
      const refreshed = engine.listAdrs();
      process.stdout.write(`\nIndexed ADR Catalog (${refreshed.length} records):\n\n`);
      for (const d of refreshed) {
        process.stdout.write(`- ADR-${d.id}: ${d.metadata.title} [${d.metadata.status}] (${d.metadata.date || 'no date'})\n`);
        process.stdout.write(`  Path: ${d.filePath}\n`);
      }
      break;
    }

    case 'get': {
      const id = args[1];
      if (!id) {
        process.stderr.write('Error: ADR ID required: warden get <id>\n');
        process.exit(1);
      }
      const doc = engine.getAdr(id);
      if (!doc) {
        process.stderr.write(`Error: ADR "${id}" not found.\n`);
        process.exit(1);
      }
      process.stdout.write(`\nADR-${doc.id}: ${doc.metadata.title}\n`);
      process.stdout.write(`Status: ${doc.metadata.status}\n`);
      process.stdout.write(`Path: ${doc.filePath}\n\n`);
      process.stdout.write(`--- Context ---\n${doc.sections.context}\n\n`);
      process.stdout.write(`--- Decision ---\n${doc.sections.decision}\n`);
      break;
    }

    case 'graph': {
      const sub = args[1];
      const targetId = args[2];

      // Auto-index if vector store or graph is empty
      if (engine.getKnowledgeGraph().getNodeCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs();
        if (defaultDirs.length > 0) {
          await engine.indexDirectories(defaultDirs);
        }
      }

      if (sub === 'lineage') {
        if (!targetId) {
          process.stderr.write('Error: ADR ID required: warden graph lineage <id>\n');
          process.exit(1);
        }
        const report = engine.getLineage(targetId);
        process.stdout.write(`\nLineage Report for ADR-${report.targetId}:\n`);
        process.stdout.write(`Active Canonical Standard: ADR-${report.activeStandardId} (${report.isActive ? 'Active' : 'Superseded'})\n`);
        process.stdout.write(`Summary: ${report.summary}\n\n`);
        if (report.ancestors.length > 0) {
          process.stdout.write(`Predecessors Obsoleted: ${report.ancestors.map((a) => `ADR-${a}`).join(', ')}\n`);
        }
        if (report.successors.length > 0) {
          process.stdout.write(`Successor Chain: ${report.successors.map((s) => `ADR-${s}`).join(' -> ')}\n`);
        }
      } else if (sub === 'impact') {
        if (!targetId) {
          process.stderr.write('Error: ADR ID required: warden graph impact <id>\n');
          process.exit(1);
        }
        const impact = engine.getImpact(targetId);
        process.stdout.write(`\nArchitectural Impact Analysis: ADR-${impact.targetId} ("${impact.targetTitle}")\n`);
        process.stdout.write(`Blast Radius Score: ${impact.blastRadiusScore.toFixed(1)}\n\n`);
        process.stdout.write('Advisories:\n');
        for (const adv of impact.advisory) {
          process.stdout.write(`  - ${adv}\n`);
        }
        if (impact.directDependents.length > 0) {
          process.stdout.write('\nDirect Dependents:\n');
          for (const d of impact.directDependents) {
            process.stdout.write(`  * ADR-${d.id}: ${d.title} (${d.relation})\n`);
          }
        }
        if (impact.extensions.length > 0) {
          process.stdout.write('\nExtensions & Amendments:\n');
          for (const e of impact.extensions) {
            process.stdout.write(`  * ADR-${e.id}: ${e.title} (${e.relation})\n`);
          }
        }
        if (impact.transitiveDependents.length > 0) {
          process.stdout.write('\nTransitive Dependents:\n');
          for (const t of impact.transitiveDependents) {
            process.stdout.write(`  * ADR-${t.id}: ${t.title} (Depth: ${t.depth})\n`);
          }
        }
        if (impact.citations.length > 0) {
          process.stdout.write('\nCitations & Informational References:\n');
          for (const c of impact.citations) {
            process.stdout.write(`  * ADR-${c.id}: ${c.title}\n`);
          }
        }
      } else if (sub === 'deps') {
        if (!targetId) {
          process.stderr.write('Error: ADR ID required: warden graph deps <id>\n');
          process.exit(1);
        }
        const deps = engine.getDependencies(targetId);
        process.stdout.write(`\nUpstream Dependencies for ADR-${deps.targetId}:\n`);
        if (deps.hasDeprecatedPrerequisite) {
          process.stdout.write('WARNING: Depends on deprecated or superseded prerequisites!\n');
        }
        if (deps.dependencies.length === 0) {
          process.stdout.write('No upstream prerequisites. Foundational decision.\n');
        } else {
          for (const d of deps.dependencies) {
            process.stdout.write(`  - ADR-${d.id}: ${d.title} [Status: ${d.status}, Relation: ${d.relation}, Depth: ${d.depth}]\n`);
          }
        }
      } else if (sub === 'validate') {
        const report = engine.validateGraph();
        process.stdout.write(`\nKnowledge Graph Validation: ${report.valid ? 'VALID' : 'INVALID'}\n`);
        process.stdout.write(`Nodes: ${report.totalNodes}, Edges: ${report.totalEdges}, Errors: ${report.errors.length}, Warnings: ${report.warnings.length}\n\n`);
        if (report.errors.length > 0) {
          process.stdout.write('ERRORS:\n');
          for (const err of report.errors) {
            process.stdout.write(`  [${err.code}] ${err.message}\n    Remediation: ${err.remediation}\n`);
          }
        }
        if (report.warnings.length > 0) {
          process.stdout.write('\nWARNINGS:\n');
          for (const warn of report.warnings) {
            process.stdout.write(`  [${warn.code}] ${warn.message}\n    Remediation: ${warn.remediation}\n`);
          }
        }
      } else if (sub === 'mermaid') {
        const mermaid = engine.getGraphMermaid({ focusId: targetId });
        process.stdout.write(`\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`);
      } else {
        process.stderr.write('Usage: warden graph <validate|lineage|impact|deps|mermaid> [id]\n');
        process.exit(1);
      }
      break;
    }

    case 'vocab':
    case 'vocabulary': {
      // Auto-index if vector store is empty
      if (engine.getVectorStore().getDocumentCount() === 0) {
        const defaultDirs = discoverDefaultAdrDirs();
        if (defaultDirs.length > 0) {
          process.stdout.write(`Index empty. Auto-indexing ${defaultDirs.join(', ')}...\n`);
          await engine.indexDirectories(defaultDirs);
        }
      }

      const terms = engine.getVocabulary();
      process.stdout.write(`\nHarvested In-Situ Architectural Vocabulary (${terms.length} terms):\n\n`);
      for (const t of terms.slice(0, 50)) {
        process.stdout.write(`- ${t.displayName} [\`${t.term}\`] (${t.docCount} docs, ${t.totalOccurrences} occurrences, sources: ${t.sources.join(', ')})\n`);
      }
      break;
    }

    case 'help':
    default: {
      process.stdout.write(`
ADR Warden (warden / adr-warden)
Deterministic vector overlap guard and decision lineage graph for ADRs

Usage:
  warden mcp                        Start Model Context Protocol (MCP) server on stdio
  warden index [dir...]             Index ADR directories with incremental embedding cache
  warden search <query>             Semantic vector search across indexed ADRs
  warden check --file <path>        Check a draft ADR file for overlap and duplicate risk
  warden check -t <title> -c <ctx>  Check draft components for overlap
  warden vocabulary                 List canonical technical terms harvested in-situ from ADRs
  warden graph validate             Validate knowledge graph (cycles, dangling links, split-brain)
  warden graph lineage <id>         Trace supersession lineage and active replacement chain
  warden graph impact <id>          Evaluate downstream blast radius and dependents
  warden graph deps <id>            Inspect upstream dependencies and prerequisites
  warden graph mermaid [id]         Export Mermaid architecture topology diagram
  warden list                       List all indexed ADRs
  warden get <id>                   View details of an indexed ADR
  warden help                       Show this help message
`);
      break;
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
