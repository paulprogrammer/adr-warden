import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADRS_1_TO_10, type AdrDef } from './sample-adrs-1-10.js';
import { ADRS_11_TO_20 } from './sample-adrs-11-20.js';
import { ADRS_21_TO_30 } from './sample-adrs-21-30.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALL_ADRS: AdrDef[] = [
  ...ADRS_1_TO_10,
  ...ADRS_11_TO_20,
  ...ADRS_21_TO_30,
];

function formatAdrMarkdown(adr: AdrDef): string {
  let content = `# ADR-${adr.id}: ${adr.title}\n\n`;

  // Status with supersession markdown link if applicable
  if (adr.status.startsWith('superseded') && adr.supersededBy && adr.supersededBy.length > 0) {
    const target = ALL_ADRS.find((a) => a.id === adr.supersededBy![0]);
    if (target) {
      content += `* Status: superseded by [ADR-${target.id}](${target.id}-${target.slug}.md)\n`;
    } else {
      content += `* Status: ${adr.status}\n`;
    }
  } else {
    content += `* Status: ${adr.status}\n`;
  }

  content += `* Deciders: ${adr.deciders.join(', ')}\n`;
  content += `* Date: ${adr.date}\n`;
  content += `Technical Story: ${adr.story}\n`;
  content += `* Category: ${adr.category}\n`;

  if (adr.supersedes && adr.supersedes.length > 0) {
    content += `* Supersedes: ${adr.supersedes.map((s) => `ADR-${s}`).join(', ')}\n`;
  }
  if (adr.supersededBy && adr.supersededBy.length > 0) {
    content += `* Superseded by: ${adr.supersededBy.map((s) => `ADR-${s}`).join(', ')}\n`;
  }
  if (adr.dependsOn && adr.dependsOn.length > 0) {
    content += `* Depends on: ${adr.dependsOn.map((s) => `ADR-${s}`).join(', ')}\n`;
  }
  if (adr.requiredBy && adr.requiredBy.length > 0) {
    content += `* Required by: ${adr.requiredBy.map((s) => `ADR-${s}`).join(', ')}\n`;
  }
  if (adr.extends && adr.extends.length > 0) {
    content += `* Extends: ${adr.extends.map((s) => `ADR-${s}`).join(', ')}\n`;
  }
  if (adr.amends && adr.amends.length > 0) {
    content += `* Amends: ${adr.amends.map((s) => `ADR-${s}`).join(', ')}\n`;
  }

  content += `\n## Context and Problem Statement\n\n${adr.context}\n\n`;

  content += `## Decision Drivers\n\n`;
  for (const d of adr.drivers) {
    content += `* ${d}\n`;
  }
  content += `\n`;

  content += `## Considered Options\n\n`;
  for (let i = 0; i < adr.options.length; i++) {
    content += `* Option ${i + 1}: ${adr.options[i].name}\n`;
  }
  content += `\n`;

  content += `## Decision Outcome\n\n`;
  content += `Chosen option: "${adr.chosenOption}", because ${adr.rationale}\n\n`;

  content += `### Positive Consequences\n\n`;
  for (const p of adr.positiveConsequences) {
    content += `* ${p}\n`;
  }
  content += `\n`;

  content += `### Negative Consequences\n\n`;
  for (const n of adr.negativeConsequences) {
    content += `* ${n}\n`;
  }
  content += `\n`;

  if (adr.diagram) {
    content += `### Architecture Topology\n\n\`\`\`mermaid\n${adr.diagram}\n\`\`\`\n\n`;
  }

  content += `## Pros and Cons of the Options\n\n`;
  for (let i = 0; i < adr.options.length; i++) {
    const opt = adr.options[i];
    content += `### Option ${i + 1}: ${opt.name}\n\n${opt.description}\n\n`;
    for (const pro of opt.pros) {
      content += `* Good, because ${pro}\n`;
    }
    for (const con of opt.cons) {
      content += `* Bad, because ${con}\n`;
    }
    content += `\n`;
  }

  content += `## Links and Primary Sources\n\n`;
  const internals = adr.links.filter((l) => l.category === 'internal');
  if (internals.length > 0) {
    content += `### Internal Platform Links\n`;
    for (const link of internals) {
      content += `* [${link.text}](${link.url})\n`;
    }
    content += `\n`;
  }

  const canonicals = adr.links.filter((l) => l.category === 'canonical');
  if (canonicals.length > 0) {
    content += `### Canonical Primary Sources\n`;
    for (const link of canonicals) {
      content += `* [${link.text}](${link.url})\n`;
    }
    content += `\n`;
  }

  return content;
}

function generateIndexReadme(): string {
  let md = `# Architecture Decision Records (ADRs)\n\n`;
  md += `This directory houses 30 sample Architecture Decision Records formatted using the [MADR 3.0 (Markdown Architectural Decision Records)](https://adr.github.io/madr/) specification. All records are sanitized of proprietary or customer-specific details and represent a realistic, production-grade cloud platform engineering ecosystem.\n\n`;
  md += `This repository serves as a live demonstration environment to learn how to search, validate, and query architecture decision lifecycles using **ADR Warden** (\`warden\` / \`adr-warden\`).\n\n`;

  md += `## Guided Tutorial: Using ADR Warden with Sample Records\n\n`;
  md += `### 1. Build and Index the Decision Catalog\n\n`;
  md += `Index the ADR catalog into a local embedding cache. ADR Warden parses markdown metadata, extracts semantic sections, and generates incremental embeddings:\n\n`;
  md += `\`\`\`bash\n# Index the local docs/adr directory\nwarden index docs/adr\n\`\`\`\n\n`;

  md += `### 2. Semantic Vector Search\n\n`;
  md += `Query the architecture repository using natural language questions. Vector search matches conceptual relevance even when keywords differ:\n\n`;
  md += `\`\`\`bash\n# Find decisions regarding stateless application architecture\nwarden search "maintaining stateless services and external session state"\n\n# Query disaster recovery topologies\nwarden search "failover recovery time objectives multi-region"\n\n# Query zero-trust and internal encryption\nwarden search "mutual TLS encryption between services"\n\`\`\`\n\n`;

  md += `### 3. Pre-Authoring Prior Art & Overlap Guard\n\n`;
  md += `Before authoring a new ADR, verify whether the catalog already contains conflicting, duplicate, or predecessor decisions:\n\n`;
  md += `\`\`\`bash\n# Check a proposed decision before drafting\nwarden check \\\n  -t "Adopt RabbitMQ for asynchronous event notifications" \\\n  -c "Need asynchronous message broker for order events" \\\n  -d "Deploy RabbitMQ cluster for publish-subscribe events"\n\`\`\`\n\n`;
  md += `*The overlap analyzer will detect that ADR-0019 already chose Apache Kafka and that ADR-0006 was superseded, advising you to extend ADR-0019 rather than creating an architectural split-brain.*\n\n`;

  md += `### 4. Knowledge Graph Validation\n\n`;
  md += `Verify graph integrity across all 30 records to ensure zero dangling references, zero cyclic dependencies, and zero split-brain decisions:\n\n`;
  md += `\`\`\`bash\nwarden graph validate\n\`\`\`\n\n`;

  md += `### 5. Supersession Lineage Tracing\n\n`;
  md += `Trace the evolution of superseded architectural standards from their inception to the active modern replacement:\n\n`;
  md += `\`\`\`bash\n# Trace how ADR-0001 (Static Files) evolved into ADR-0012 (Dynamic GitOps Config)\nwarden graph lineage 0001\n\n# Trace how ADR-0003 (Systemd Hosts) evolved into ADR-0015 (GitOps Delivery)\nwarden graph lineage 0003\n\`\`\`\n\n`;

  md += `### 6. Blast Radius and Downstream Impact Analysis\n\n`;
  md += `Evaluate the downstream ripple effect before proposing changes to a foundational decision:\n\n`;
  md += `\`\`\`bash\n# Analyze blast radius of modifying ADR-0004 (Immutable Container Promotion)\nwarden graph impact 0004\n\n# Analyze dependencies of ADR-0015 (GitOps Application Delivery)\nwarden graph impact 0015\n\`\`\`\n\n`;

  md += `### 7. Upstream Prerequisite Inspection\n\n`;
  md += `Inspect the prerequisite architectural standards required before implementing an advanced capability:\n\n`;
  md += `\`\`\`bash\n# Inspect upstream dependencies required for Disaster Recovery (ADR-0027)\nwarden graph deps 0027\n\n# Inspect prerequisites for Canary Deployments (ADR-0013)\nwarden graph deps 0013\n\`\`\`\n\n`;

  md += `### 8. Export Architecture Topology Diagrams\n\n`;
  md += `Export the entire decision lineage graph as a Mermaid diagram:\n\n`;
  md += `\`\`\`bash\n# Print full architecture graph in Mermaid syntax\nwarden graph mermaid\n\`\`\`\n\n`;

  md += `### 9. Model Context Protocol (MCP) Server Integration\n\n`;
  md += `Expose all search and lifecycle capabilities directly to AI agents (such as Antigravity, Claude Desktop, or Cursor) over standard I/O:\n\n`;
  md += `\`\`\`bash\nwarden mcp\n\`\`\`\n\n`;

  md += `Configure in your project's \`.mcp.json\` or \`.agents/mcp_config.json\`:\n\n`;
  md += `\`\`\`json\n{\n  "mcpServers": {\n    "adr-warden": {\n      "command": "warden",\n      "args": ["mcp"],\n      "env": {\n        "ADR_DIRS": "./docs/adr",\n        "ADR_CACHE_DIR": "./.adr-cache"\n      }\n    }\n  }\n}\n\`\`\`\n\n`;

  md += `## Catalog Index (30 Records)\n\n`;
  md += `| ID | Title | Status | Category | Lineage & Dependencies |\n`;
  md += `|:---|:------|:-------|:---------|:-----------------------|\n`;

  for (const adr of ALL_ADRS) {
    let rels: string[] = [];
    if (adr.supersedes) rels.push(`Supersedes: ${adr.supersedes.map((s) => `[${s}](#)`).join(', ')}`);
    if (adr.supersededBy) rels.push(`Superseded by: ${adr.supersededBy.map((s) => `[${s}](#)`).join(', ')}`);
    if (adr.dependsOn) rels.push(`Depends on: ${adr.dependsOn.map((s) => `[${s}](#)`).join(', ')}`);
    if (adr.extends) rels.push(`Extends: ${adr.extends.map((s) => `[${s}](#)`).join(', ')}`);
    const relStr = rels.length > 0 ? rels.join('; ') : '-';
    md += `| [ADR-${adr.id}](${adr.id}-${adr.slug}.md) | ${adr.title} | \`${adr.status.split(' ')[0]}\` | ${adr.category} | ${relStr} |\n`;
  }

  md += `\n`;
  return md;
}

export function main() {
  const targetDir = resolve(__dirname, '../docs/adr');
  mkdirSync(targetDir, { recursive: true });

  console.log(`Writing 30 ADRs into ${targetDir}...`);
  for (const adr of ALL_ADRS) {
    const filename = `${adr.id}-${adr.slug}.md`;
    const fullPath = resolve(targetDir, filename);
    const content = formatAdrMarkdown(adr);
    writeFileSync(fullPath, content, 'utf8');
    console.log(`  Created ${filename}`);
  }

  const readmePath = resolve(targetDir, 'README.md');
  writeFileSync(readmePath, generateIndexReadme(), 'utf8');
  console.log(`  Created README.md`);
  console.log(`Successfully generated 30 sample ADRs and index documentation.`);
}

main();
