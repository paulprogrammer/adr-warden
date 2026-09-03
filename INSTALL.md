# ADR Warden: Harness Integration and Installation Guide

## Problem Statement

Autonomous agents operating inside architecture repositories require two synchronized capabilities to maintain catalog hygiene:
1. A runtime protocol transport (MCP) providing deterministic semantic search, overlap scoring, and graph traversal tools.
2. Behavioral instruction runbooks (Skills) that force the agent harness to invoke pre-flight checks before modifying files and to validate graph topologies before submitting changes.

This guide provides concrete configurations to wire ADR Warden (`adr-warden`) and its deliverable skills into common agent harness clients.

---

## Prerequisites and Build

The engine requires Node.js (version 20 or higher) and `pnpm`.

```bash
# Clone and navigate to the engine directory
cd /path/to/adr-warden

# Install dependencies and compile TypeScript to dist/
pnpm install
pnpm run build

# Verify build stability
pnpm test
```

The compiled CLI entry point is located at:
`<ABSOLUTE_PATH_TO_ENGINE>/dist/cli.js`

---

## Environment Configuration

The MCP server accepts two primary environment variables:

Variable | Default | Description
:--- | :--- | :---
`ADR_DIRS` | `./docs/adr` | Comma-separated list of directories containing active Architecture Decision Records.
`ADR_CACHE_DIR` | `./.adr-cache` | Directory path where vector embeddings and document hashes are persisted.

> [!IMPORTANT]
> Always supply absolute paths or paths relative to the consuming repository workspace root. Exclude historical or legacy archive folders from `ADR_DIRS` to avoid indexing superseded schemas.

---

## Client Configuration Reference

### 1. Antigravity and Agentic CLI Workspaces

Antigravity automatically discovers MCP servers and project skills defined in your workspace root.

#### MCP Server Registration: `.agents/mcp_config.json`
Add the `adr-warden` server configuration:

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "node",
      "args": [
        "/path/to/adr-warden/dist/cli.js",
        "mcp"
      ],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

#### Skill Installation
Copy the deliverable skills from this repository into the target workspace `.agents/skills/` directory:

```bash
# From the target architecture repository root:
mkdir -p .agents/skills

cp -r /path/to/adr-warden/skills/adr-authoring-guard .agents/skills/
cp -r /path/to/adr-warden/skills/adr-graph-lifecycle .agents/skills/
```

Once placed in `.agents/skills/`, the harness progressively discloses these workflows whenever the agent is tasked with authoring an ADR or evaluating dependencies.

---

### 2. Claude Desktop

Claude Desktop configures MCP servers globally via its primary configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Configuration Entry

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "node",
      "args": [
        "/path/to/adr-warden/dist/cli.js",
        "mcp"
      ],
      "env": {
        "ADR_DIRS": "/path/to/target-architecture-repo/docs/adr",
        "ADR_CACHE_DIR": "/path/to/target-architecture-repo/.adr-cache"
      }
    }
  }
}
```

#### Skill Ingestion (Prompt Integration)
Claude Desktop does not support native progressive skill folders. To enforce the authoring guard and lifecycle rules, append the contents of `skills/adr-authoring-guard/SKILL.md` and `skills/adr-graph-lifecycle/SKILL.md` directly into your Project Instructions or system prompt.

---

### 3. Claude Code (CLI)

Claude Code (`claude`) supports Model Context Protocol servers at both project scope (stored in `.mcp.json`) and global user scope.

#### Option A: CLI Command Registration
Run from the root of your target architecture repository:

```bash
# Register at project scope (.mcp.json)
claude mcp add -s project adr-warden \
  -e ADR_DIRS="./docs/adr" \
  -e ADR_CACHE_DIR="./.adr-cache" \
  -- node /path/to/adr-warden/dist/cli.js mcp
```

#### Option B: Declarative Configuration via `.mcp.json`
Create or update `.mcp.json` in the root of the target architecture repository:

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "node",
      "args": [
        "/path/to/adr-warden/dist/cli.js",
        "mcp"
      ],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

#### Rule Enforcement: `CLAUDE.md`
Claude Code automatically reads `CLAUDE.md` at project startup. Add the following directives to enforce the pre-flight overlap guard and graph validation lifecycle:

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

### 4. Cursor IDE

Cursor supports MCP servers configured at the workspace level or user settings level.

#### Configuration Entry: `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "node",
      "args": [
        "/path/to/adr-warden/dist/cli.js",
        "mcp"
      ],
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

For VS Code extensions implementing the Model Context Protocol (such as Cline or Roo Code), configure the server under the extension's MCP configuration settings.

#### Configuration Entry: `cline_mcp_settings.json` / `roo_code_mcp_settings.json`

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "node",
      "args": [
        "/path/to/adr-warden/dist/cli.js",
        "mcp"
      ],
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

Windsurf supports MCP servers via its central configuration file (`~/.codeium/windsurf/mcp_config.json`).

#### Configuration Entry

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "node",
      "args": [
        "/path/to/adr-warden/dist/cli.js",
        "mcp"
      ],
      "env": {
        "ADR_DIRS": "/path/to/target-architecture-repo/docs/adr",
        "ADR_CACHE_DIR": "/path/to/target-architecture-repo/.adr-cache"
      }
    }
  }
}
```

---

## Verification and Sanity Checklist

Validate your configuration in three steps before deploying autonomous agents:

### Step 1: Verify Direct CLI Indexing and Validation
Run the binary directly against the target ADR catalog:

```bash
# Verify directory scan and embedding cache generation
node /path/to/adr-warden/dist/cli.js index /path/to/target-architecture-repo/docs/adr

# Verify graph structural validation
node /path/to/adr-warden/dist/cli.js graph validate
```

Confirm that the validation report outputs:
`Knowledge Graph Validation: VALID`

### Step 2: Test Interactive MCP Inspector
Use the official MCP inspector to verify protocol handshake and tool registration over stdio:

```bash
npx @modelcontextprotocol/inspector node /path/to/adr-warden/dist/cli.js mcp
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
