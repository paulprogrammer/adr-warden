# ADR Search and Lifecycle Vector Engine

A lightweight, fully local vector embedding engine and Model Context Protocol (MCP) server for Architecture Decision Records (ADRs). Designed to prevent duplicate architectural decisions, detect conflicting directions, and identify extension or obsolescence targets across multi-catalog repositories.

## Problem Statement

When autonomous coding agents and platform engineers author architectural decision records in isolation, they frequently fail to discover existing, near-identical records. This creates architectural fragmentation: redundant records proliferate, conflicting standards are introduced silently, and downstream teams are left to reconcile split-brain platform contracts.

This engine solves that failure mode at the agent authoring loop. By exposing deterministic semantic search and overlap analysis tools over standard MCP stdio transport, agents can evaluate their draft decisions against the entire historical and target-state ADR catalog before authoring net-new documents.

## Architectural Design

The engine runs entirely in Node.js using `pnpm` without external API key dependencies or cloud vector database overhead:

- **Local Vector Extraction**: Uses `@huggingface/transformers` executing an optimized ONNX pipeline (`Xenova/all-MiniLM-L6-v2`) generating 384-dimensional dense vectors.
- **Deterministic Multi-Vector Decomposition**: ADRs are decomposed into distinct semantic chunks (document summary, problem context, decision outcome, and evaluated options) rather than monolithic document blobs.
- **Title and Granular Similarity Scoring**: Uses exact cosine similarity across normalized Float32 vectors, cross-referencing title alignment, problem domain proximity, and decision convergence.
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
- **Output**: Diagnostic verdict (`DUPLICATE_RISK`, `CONFLICT_RISK`, `EXTENSION_CANDIDATE`, `NOVEL`), confidence score, actionable guidance, and ranked candidate ADRs with individual similarity breakdowns.

### 2. `search_adrs`
Performs semantic natural language search across indexed records.

- **Parameters**:
  - `query` (string): Natural language question or architectural topic
  - `top_k` (number, optional): Number of results (default: 5)
  - `threshold` (number, optional): Minimum cosine similarity (default: 0.35)
  - `status` (string, optional): Filter by status (`proposed`, `accepted`, `superseded`, etc.)
  - `section` (enum, optional): Target section (`all`, `summary`, `context`, `decision`, `options`)

### 3. `get_adr`
Retrieves full parsed structured metadata, context, decision rationale, and mermaid diagrams for a specific ADR.

- **Parameters**:
  - `id` (string): Numeric or prefixed identifier (e.g. `0001`, `ADR-001`)

### 4. `list_adrs`
Lists the complete catalog of indexed ADRs with status, dates, and lineage relations (`supersedes`, `extends`, `amends`).

- **Parameters**:
  - `status` (string, optional): Filter by status

### 5. `index_adrs`
Scans and synchronizes target directories with the embedding cache.

- **Parameters**:
  - `directories` (string[], optional): Custom directories to index
  - `force` (boolean, optional): Recompute embeddings ignoring cache

## MCP Server Configuration

To wire this server into an agent workspace (such as `.mcp.json` or `.agents/mcp_config.json`), configure the stdio command:

```json
{
  "mcpServers": {
    "adr-search": {
      "command": "node",
      "args": [
        "/home/paul/PROJ/adr-search-and-lifecycle/dist/cli.js",
        "mcp"
      ],
      "env": {
        "ADR_DIRS": "./docs/adr,./legacy_adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

## CLI Usage

The package provides a direct CLI binary for developer and CI automation:

```bash
# Index repositories
pnpm exec adr-vector index ./docs/adr ./docs/adr

# Search semantically
pnpm exec adr-vector search "how do we handle secrets and runtime variables"

# Check draft overlap
pnpm exec adr-vector check \
  --title "Runtime Configuration Architecture" \
  --context "Configuration is scattered across pipelines causing divergence." \
  --decision "Use an abstracted parameter store with Git overlays."

# Inspect ADR details
pnpm exec adr-vector get 0001

# List all catalog entries
pnpm exec adr-vector list
```

## Verification & Test Suite

Run the automated test suite with Vitest:

```bash
pnpm test
```
