# ADR Warden: Harness Integration and Installation Guide

## Problem Statement

Autonomous agents operating inside architecture repositories require two synchronized capabilities to maintain catalog hygiene:
1. A runtime protocol transport (MCP) providing deterministic semantic search, overlap scoring, and graph traversal tools.
2. Behavioral instruction runbooks (Skills) that force the agent harness to invoke pre-flight checks before modifying files and to validate graph topologies before submitting changes.

This guide provides step-by-step instructions for acquiring ADR Warden from Git, building the CLI, and configuring the MCP server and skills across standard harness clients.

---

## Repository and Prerequisites

- **GitHub Repository**: [https://github.com/paulprogrammer/adr-warden](https://github.com/paulprogrammer/adr-warden)
- **Runtime**: Node.js (version 20 or higher)
- **Package Manager**: `pnpm` (version 9 or higher)

---

## Installation Options

### Option 1: Clone and Build Locally (Recommended)

Clone the repository and build the TypeScript binaries:

```bash
git clone https://github.com/paulprogrammer/adr-warden.git
cd adr-warden

# Install dependencies and compile
pnpm install
pnpm run build

# Verify build and test suite
pnpm test
```

To make the `warden` and `adr-warden` commands accessible globally on your system path:

```bash
pnpm link --global
```

### Option 2: Install Directly from GitHub via Global Package Manager

You can install ADR Warden globally directly from the Git repository:

```bash
pnpm add -g github:paulprogrammer/adr-warden
# or using npm:
# npm install -g github:paulprogrammer/adr-warden
```

Once installed globally, `warden` is directly available in your terminal and MCP client configurations.

---

## Environment Configuration

The MCP server accepts two primary environment variables:

Variable | Default | Description
:--- | :--- | :---
`ADR_DIRS` | `./docs/adr` | Comma-separated list of directories containing active Architecture Decision Records.
`ADR_CACHE_DIR` | `./.adr-cache` | Directory path where vector embeddings and document hashes are persisted.

> [!IMPORTANT]
> Supply paths relative to the consuming repository workspace root or provide absolute paths. Exclude historical or legacy archive directories from `ADR_DIRS` to prevent indexing obsolete standards.

---

## Client Configuration Reference

### 1. Antigravity and Agentic CLI Workspaces

Antigravity automatically discovers MCP servers and project skills defined within a workspace.

#### MCP Server Registration: `.agents/mcp_config.json`
Add the `adr-warden` server to your repository's `.agents/mcp_config.json`:

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "warden",
      "args": ["mcp"],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

*Note: If `warden` is not linked globally on your system `$PATH`, specify the compiled entry point directly:*
```json
"command": "node",
"args": ["/path/to/adr-warden/dist/cli.js", "mcp"]
```

#### Skill Installation
From your target architecture repository root, install the deliverable skills into `.agents/skills/`:

```bash
mkdir -p .agents/skills

# If cloned locally:
cp -r /path/to/adr-warden/skills/adr-authoring-guard .agents/skills/
cp -r /path/to/adr-warden/skills/adr-graph-lifecycle .agents/skills/

# Or fetch directly from GitHub without keeping a local clone:
git clone --depth 1 https://github.com/paulprogrammer/adr-warden.git /tmp/adr-warden
cp -r /tmp/adr-warden/skills/* .agents/skills/
rm -rf /tmp/adr-warden
```

---

### 2. Claude Code (CLI)

Claude Code (`claude`) supports Model Context Protocol servers at project scope (saved in `.mcp.json`) or global user scope.

#### Option A: Command Line Registration
Run from the root of your target architecture repository:

```bash
claude mcp add -s project adr-warden \
  -e ADR_DIRS="./docs/adr" \
  -e ADR_CACHE_DIR="./.adr-cache" \
  -- warden mcp
```

#### Option B: Declarative Configuration via `.mcp.json`
Create or update `.mcp.json` in the root of the target architecture repository:

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "warden",
      "args": ["mcp"],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

#### Rule Enforcement: `CLAUDE.md`
Claude Code automatically ingests `CLAUDE.md` at project launch. Add the following directives to enforce the authoring guard and lifecycle validations:

```markdown
## Architectural Decision Records (ADRs)

When evaluating or drafting architecture records under docs/adr/:
1. Pre-Authoring Guard: Always call check_adr_overlap with draft title, context, and decision before creating files.
   - If DUPLICATE_RISK or CONFLICT_RISK: Halt file creation. Propose updating or enriching existing records via get_adr.
   - If EXTENSION_CANDIDATE: Add extends: [<targetId>] to frontmatter and link to base standard.
   - If NOVEL: Proceed with standard MADR authoring.
2. Lineage Traversal: Use adr_graph_lineage to ensure target records are active standards. Never extend superseded records.
3. Pre-Commit Verification: Run adr_graph_validate before completing tasks. Zero fatal errors (CYCLE_DETECTED, DANGLING_REFERENCE, STATUS_CONTRADICTION) are permitted.
```

---

### 3. Claude Desktop

Claude Desktop configures MCP servers via its primary configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Configuration Entry

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "warden",
      "args": ["mcp"],
      "env": {
        "ADR_DIRS": "/absolute/path/to/target-architecture-repo/docs/adr",
        "ADR_CACHE_DIR": "/absolute/path/to/target-architecture-repo/.adr-cache"
      }
    }
  }
}
```

#### Skill Ingestion
Claude Desktop does not support progressive skill directories. Copy the directives from `skills/adr-authoring-guard/SKILL.md` and `skills/adr-graph-lifecycle/SKILL.md` directly into your Project Instructions or system prompt.

---

### 4. Cursor IDE

Cursor supports MCP servers configured at the workspace level or in user settings.

#### Configuration Entry: `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "warden",
      "args": ["mcp"],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

#### Rule Enforcement: `.cursorrules`
Add mandatory behavioral instructions to `.cursorrules` in the consuming repository:

```markdown
# Architectural Decision Standard

When working with files in docs/adr/ or designing architecture:
1. Always run the MCP tool check_adr_overlap before creating new ADR files.
   - If verdict is DUPLICATE_RISK or CONFLICT_RISK, halt immediately. Propose enriching existing records.
   - If verdict is EXTENSION_CANDIDATE, add extends: [targetId] to frontmatter.
2. Before committing changes to docs/adr/, run adr_graph_validate. Zero fatal errors are permitted.
```

---

### 5. VS Code (Cline, Roo Code, Continue)

For VS Code extensions implementing the Model Context Protocol, configure the server under your extension's MCP configuration settings (e.g. `cline_mcp_settings.json`).

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "warden",
      "args": ["mcp"],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      },
      "disabled": false,
      "autoApprove": [
        "check_adr_overlap",
        "search_adrs",
        "get_adr",
        "list_adrs",
        "adr_graph_lineage",
        "adr_graph_impact",
        "adr_graph_dependencies",
        "adr_graph_validate",
        "adr_graph_mermaid"
      ]
    }
  }
}
```

---

### 6. Windsurf (Codeium)

Configure the server in `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "warden",
      "args": ["mcp"],
      "env": {
        "ADR_DIRS": "/absolute/path/to/target-architecture-repo/docs/adr",
        "ADR_CACHE_DIR": "/absolute/path/to/target-architecture-repo/.adr-cache"
      }
    }
  }
}
```

---

## Verification and Sanity Checklist

Validate your configuration in three steps before deploying autonomous agents:

### Step 1: Verify Direct CLI Indexing and Validation
Run the binary directly against your target ADR catalog:

```bash
# Verify directory scan and embedding cache generation
warden index ./docs/adr

# Verify graph structural validation
warden graph validate
```

Confirm that the validation report outputs:
`Knowledge Graph Validation: VALID`

### Step 2: Test Interactive MCP Inspector
Use the official MCP inspector to verify protocol handshake and tool registration over stdio:

```bash
npx @modelcontextprotocol/inspector warden mcp
```

Confirm that all 10 tools are enumerated:
- `check_adr_overlap`
- `search_adrs`
- `get_adr`
- `list_adrs`
- `index_adrs`
- `adr_graph_lineage`
- `adr_graph_impact`
- `adr_graph_dependencies`
- `adr_graph_validate`
- `adr_graph_mermaid`

### Step 3: Run Agent Overlap Sniff Test
Ask the configured agent harness:
`"I want to write a new ADR proposing an immutable container digest promotion strategy."`

Verify that the agent harness:
1. Calls `check_adr_overlap` before creating any file.
2. Identifies the collision against `ADR-0002` (`DUPLICATE_RISK`).
3. Halts file creation and advises enriching the existing standard.
