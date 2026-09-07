# ADR Warden

[![npm version](https://img.shields.io/npm/v/adr-warden.svg)](https://www.npmjs.com/package/adr-warden)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, fully local vector embedding engine, decision lineage knowledge graph, and Model Context Protocol (MCP) server for Architecture Decision Records (ADRs). Designed to prevent duplicate architectural decisions, detect conflicting directions, and validate relational dependencies across architecture repositories.

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

# Run CLI commands
npx adr-warden search "authentication pattern"
```

### Project Dependency

To pin ADR Warden within a specific project or CI workflow:

```bash
npm install --save-dev adr-warden
# or
pnpm add -D adr-warden
```

---

## Problem Statement

When autonomous coding agents and platform engineers author architectural decision records in isolation, they frequently fail to discover existing, near-identical records. This creates architectural fragmentation: redundant records proliferate, conflicting standards are introduced silently, and downstream teams are left to reconcile split-brain platform contracts.

This engine solves that failure mode at the agent authoring loop. By exposing deterministic semantic search and overlap analysis tools over standard MCP stdio transport, agents can evaluate their draft decisions against the entire historical and target-state ADR catalog before authoring net-new documents.

## Architectural Design

The engine runs entirely in Node.js without external API key dependencies or cloud vector database overhead:

- **Local Vector Extraction**: Uses `@huggingface/transformers` executing an optimized ONNX pipeline (`Xenova/all-MiniLM-L6-v2`) generating 384-dimensional dense vectors.
- **Hybrid Dense-Sparse Retrieval**: Merges dense vector cosine similarity with Okapi BM25 sparse scoring via Reciprocal Rank Fusion ($K=60$), ensuring exact acronyms, versions, and libraries match alongside semantic concepts.
- **Structured In-Situ Vocabulary Harvester**: Scans repository markdown records across code spans, headers, option lists, and clause boundaries to extract domain vocabulary and bond compound terms into single high-IDF tokens.
- **Deterministic Multi-Vector Decomposition**: ADRs are decomposed into distinct semantic chunks (document summary, problem context, decision outcome, and evaluated options) rather than monolithic document blobs.
- **Title and Granular Similarity Scoring**: Uses exact cosine similarity across normalized Float32 vectors, cross-referencing title alignment, problem domain proximity, decision convergence, and shared technical entities.
- **Incremental SHA-256 Embedding Cache**: Avoids redundant inference cycles. On disk, unmodified records resolve in sub-millisecond time.
- **MCP Server Protocol**: Implements `@modelcontextprotocol/sdk` exposing tools, resources, and prompt templates over `stdio`.

## Exposed MCP Tools

### 1. `check_adr_overlap`
Evaluates a proposed ADR before authoring to detect duplicates, conflicts, or extension targets.

- **Parameters**:
  - `title` (string): Draft ADR title
  - `context` (string): Problem statement and background context
  - `decision` (string): Proposed architectural decision outcome
  - `options` (string, optional): Alternatives evaluated
  - `drivers` (string, optional): Decision drivers
  - `threshold` (number, optional): Similarity threshold (default: 0.50)
  - `top_k` (number, optional): Max matches to return (default: 5)
- **Output**: Diagnostic verdict (`DUPLICATE_RISK`, `CONFLICT_RISK`, `EXTENSION_CANDIDATE`, `NOVEL`), confidence score, actionable guidance, shared technical entities, attributed keywords, and ranked candidate ADRs with individual similarity breakdowns.

### 2. `search_adrs`
Performs hybrid semantic and lexical keyword search across indexed records.

- **Parameters**:
  - `query` (string): Natural language question or architectural topic
  - `top_k` (number, optional): Number of results (default: 5)
  - `threshold` (number, optional): Minimum similarity threshold (default: 0.35)
  - `status` (string, optional): Filter by status (`proposed`, `accepted`, `superseded`, etc.)
  - `section` (enum, optional): Target section (`all`, `summary`, `context`, `decision`, `options`)
  - `mode` (enum, optional): Search mode (`hybrid` default, `dense`, `sparse`)

### 3. `get_adr`
Retrieves full parsed structured metadata, context, decision rationale, and mermaid diagrams for a specific ADR.

- **Parameters**:
  - `id` (string): Numeric or prefixed identifier (e.g. `0001`, `ADR-001`)

### 4. `list_adrs`
Lists the complete catalog of indexed ADRs with status, dates, and lineage relations (`supersedes`, `extends`, `amends`).

- **Parameters**:
  - `status` (string, optional): Filter by status

### 5. `index_adrs`
Scans and synchronizes target directories with the embedding cache and rebuilds the in-situ vocabulary.

- **Parameters**:
  - `directories` (string[], optional): Custom directories to index
  - `force` (boolean, optional): Recompute embeddings ignoring cache

### 6. `adr_graph_lineage`
Traverses decision supersession and replacement lineage for an ADR. Resolves active replacement standard, obsolete predecessors, and chronological timeline.

- **Parameters**:
  - `id` (string): ADR identifier to trace lineage for

### 7. `adr_graph_impact`
Performs architectural impact analysis (blast radius) for an ADR. Enumerates direct downstream dependents, specializing extensions, transitive dependencies, and citations.

- **Parameters**:
  - `id` (string): ADR identifier to evaluate impact for

### 8. `adr_graph_dependencies`
Resolves upstream architectural dependencies in topological order. Flags deprecated or superseded prerequisites.

- **Parameters**:
  - `id` (string): ADR identifier to evaluate upstream prerequisites for

### 9. `adr_graph_validate`
Validates architectural graph integrity across all active records: detects dangling references, circular dependencies/obsoletion loops, split-brain status contradictions, and isolated orphan records.

### 10. `adr_graph_mermaid`
Generates a clean Mermaid diagram visualizing ADR lineage, dependencies, and extensions adhering to documentation standards.

- **Parameters**:
  - `focus_id` (string, optional): Focus ADR identifier to render localized neighborhood
  - `radius` (number, optional): Neighborhood radius around focus ADR (default: 1)

### 11. `list_adr_vocabulary`
Lists technical terms and domain vocabulary harvested in-situ from repository ADRs, reporting document frequencies, occurrence counts, and declaring sources.

- **Parameters**:
  - `min_docs` (number, optional): Minimum document frequency threshold (default: 1)
  - `limit` (number, optional): Maximum terms to return (default: 50)

## MCP Server Configuration

To wire ADR Warden into an agent workspace (such as `.mcp.json`, Claude Desktop, or `.agents/mcp_config.json`):

### Option A: Using `npx` (No Global Install Required)

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "npx",
      "args": ["-y", "adr-warden", "mcp"],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

### Option B: Using Global Binary (`warden` or `adr-warden`)

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

## CLI Usage

The package provides direct CLI binaries (`warden` and `adr-warden`) for developer workflows and CI automation:

```bash
# Index active ADR catalog
warden index ./docs/adr

# Search semantically
warden search "how do we handle secrets and runtime variables"

# Check draft overlap before writing
warden check \
  --title "Runtime Configuration Architecture" \
  --context "Configuration is scattered across pipelines causing divergence." \
  --decision "Use an abstracted parameter store with Git overlays."

# Validate knowledge graph integrity (cycles, broken references, status contradictions)
warden graph validate

# Trace supersession lineage to find current active standard
warden graph lineage 0001

# Calculate downstream blast radius and dependents
warden graph impact 0001

# Inspect upstream dependencies in topological order
warden graph deps 0007

# Export Mermaid relationship diagram
warden graph mermaid 0001

# List all catalog entries
warden list
```

## Verification & Test Suite

Run the automated test suite with Vitest:

```bash
pnpm test
```

## License

This project is licensed under the [MIT License](LICENSE).
