# ADR Warden

[![npm version](https://img.shields.io/npm/v/adr-warden.svg)](https://www.npmjs.com/package/adr-warden)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, fully local vector embedding engine, decision lineage knowledge graph, and Model Context Protocol (MCP) server for Architecture Decision Records (ADRs). Designed to prevent duplicate architectural decisions, detect conflicting directions, align code changesets against approved decisions and in-flight proposals, and validate relational dependencies across architecture repositories.

## Installation

Install directly from npm: [npmjs.com/package/adr-warden](https://www.npmjs.com/package/adr-warden)

### Global Installation (CLI & MCP Server)

Install globally to make the `warden` and `adr-warden` commands accessible system-wide in your terminal and agent harnesses:

```bash
npm install -g adr-warden
# or
pnpm add -g adr-warden
```

### Instant Execution with `npx` (Zero Install)

Run any command or spin up the MCP server on-demand without prior installation:

```bash
# Launch the MCP server over stdio
npx -y adr-warden mcp

# Audit current changeset against architecture decisions
npx -y adr-warden align

# Install agent skills aligned to the installed warden version
npx -y adr-warden install-skills
```

### Project Dependency

To pin ADR Warden within a specific project or CI workflow:

```bash
npm install --save-dev adr-warden
# or
pnpm add -D adr-warden
```

---

## Agent Skills Installation (`.agents`)

ADR Warden provides specialized agent skills for AI assistants (Cursor, Antigravity, Gemini CLI, Claude Code). You can install the exact version of skills aligned to your installed version of `warden` directly into your repository's `.agents` directory:

```bash
# Downloads version-aligned skills from GitHub to .agents/skills/
warden install-skills

# Alias
warden skills install

# Also mirror skills to .gemini/skills/
warden install-skills --gemini

# Target a custom directory
warden install-skills --target custom/skills

# Install from a specific git ref or branch
warden install-skills --ref main
```

Installed skills include:
- **`adr-authoring-guard`**: Mandatory pre-flight semantic overlap check before creating or proposing new ADRs.
- **`adr-changeset-alignment`**: Audits git diffs and code changes against binding standards and in-flight proposals.
- **`adr-graph-lifecycle`**: Validates decision lineage, graph integrity, and calculates architectural blast radius.

---

## Problem Statement

When autonomous coding agents and platform engineers author architectural decision records or write code in isolation, two major failure modes occur:
1. **Redundant & Conflicting ADRs**: Autonomous agents author duplicate decisions or contradict existing architecture contracts without realizing prior art exists.
2. **Unaligned Code Changesets**: Developers and PR reviewers ship code that diverges from approved ADRs, or duplicates effort from in-flight architecture RFCs currently under review.

ADR Warden addresses both loops:
- **Authoring Gate**: Pre-flight semantic search and overlap analysis prevent duplicate ADRs before files are written.
- **Construction & Code Review Gate**: Changeset alignment (`warden align`) compares git diffs against indexed ADRs, distinguishing between **🔴 Binding Standards** (mandatory compliance) and **🟡 In-Flight Proposals** (early advisory).

---

## Remote Architecture Repository Support

In enterprise architectures, ADRs are often maintained in a central repository while development occurs across dozens of consumer repositories. ADR Warden supports loading pregenerated indexes from remote URLs without requiring a local clone of the ADR repository:

### Configuration (`.wardenrc.json`)

Create a `.wardenrc.json` in your consumer repository:

```json
{
  "mode": "construct",
  "remote": {
    "provider": "github",
    "owner": "my-org",
    "repository": "architecture-catalog",
    "branch": "main",
    "baseDir": "docs/adr",
    "indexUrl": "https://raw.githubusercontent.com/my-org/architecture-catalog/main/.adr-cache/index.json"
  },
  "rules": {
    "threshold": 0.32,
    "failOnBindingConflict": true
  }
}
```

For **Azure DevOps**:

```json
{
  "remote": {
    "provider": "azure-devops",
    "organization": "my-org",
    "project": "PlatformCore",
    "repository": "architecture-catalog",
    "branch": "main",
    "baseDir": "docs/adr",
    "indexUrl": "https://dev.azure.com/my-org/PlatformCore/_apis/git/repositories/architecture-catalog/items?path=%2F.adr-cache%2Findex.json&$format=octetStream&api-version=6.0"
  }
}
```

---

## Changeset Alignment (`warden align`)

Evaluate your working tree or pull request against published decisions:

```bash
# Audit working tree changes
warden align

# Audit comparison against main branch
warden align --diff origin/main...HEAD

# Compare staged changes only
warden align --staged

# CI/CD Quality Gate: exit with code 1 if binding standards are violated
warden align --diff origin/main...HEAD --fail-on-noncompliance

# Output structured JSON for automation or PR commenting
warden align --json
```

---

## MCP Server & Progressive Disclosure

Wire ADR Warden into your editor or agent workspace (`.mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "npx",
      "args": ["-y", "adr-warden", "mcp", "--mode", "construct"]
    }
  }
}
```

### Server Modes:
- **`--mode construct`**: Tailored for developers building code or reviewing PRs. Exposes `align_changeset`, `fetch_adr_index`, `search_adrs`, `get_adr`, and `list_adrs`.
- **`--mode author`**: Tailored for architects authoring ADRs. Exposes `check_adr_overlap`, `index_adrs`, `adr_graph_validate`, `adr_graph_lineage`, `adr_graph_impact`, and `list_adr_vocabulary`.
- **`--mode all`** (default): Exposes all authoring and construction tools.

---

## Exposed MCP Tools

### Construction & Review Tools
- **`align_changeset`**: Evaluates git diffs against indexed ADRs, returning binding standards vs in-flight proposals with web links and compliance observations.
- **`fetch_adr_index`**: Downloads or refreshes the pregenerated `index.json` from a remote URL with conditional ETag caching.

### Authoring & Overlap Tools
- **`check_adr_overlap`**: Evaluates a draft ADR before creation to detect duplicates, conflicts, or extension targets (`DUPLICATE_RISK`, `CONFLICT_RISK`, `EXTENSION_CANDIDATE`, `NOVEL`).
- **`index_adrs`**: Scans and indexes directories containing ADR markdown files.
- **`list_adr_vocabulary`**: Lists technical vocabulary harvested in-situ from ADRs.

### Knowledge Graph Tools
- **`adr_graph_lineage`**: Traces supersession lineage to determine canonical active standards.
- **`adr_graph_impact`**: Calculates downstream blast radius and affected decisions.
- **`adr_graph_dependencies`**: Resolves upstream prerequisites in topological order.
- **`adr_graph_validate`**: Validates graph integrity (cycles, split-brain status, dangling references).
- **`adr_graph_mermaid`**: Generates a Mermaid architecture topology diagram.

### Shared Retrieval Tools
- **`search_adrs`**: Hybrid dense vector + Okapi BM25 sparse search with Reciprocal Rank Fusion ($K=60$).
- **`get_adr`**: Retrieves full parsed metadata, context, decisions, and consequences.
- **`list_adrs`**: Lists all indexed ADRs with status and relationship links.

---

## Verification & Test Suite

Run the full automated test suite with Vitest:

```bash
pnpm test
```
