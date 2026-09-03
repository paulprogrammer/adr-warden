---
name: adr-authoring-guard
description: >-
  Mandatory pre-flight overlap and duplicate check for Architecture Decision Records (ADRs).
  Activate this skill whenever the user or task requests authoring, drafting, creating, proposing,
  or evaluating a new architectural decision or standard. Enforces a strict halt on duplicate proposals
  and identifies existing records to enrich or extend before touching the filesystem.
---

# ADR Authoring Guard (Pre-Flight Architectural Overlap Check)

Use this skill as a mandatory gatekeeper before creating or proposing any new ADR markdown file in `docs/adr/`.

## Problem Statement

When autonomous agents or engineers author architectural records in isolation, they frequently create duplicate decisions, fragment platform contracts, or contradict existing standards. This workflow forces a deterministic semantic check against the entire indexed catalog before any file is created.

---

## Pre-Flight Execution Workflow

```
[Agent Receives Architecture Task]
              │
              ▼
    1. Formulate Proposal Core
    (title, context, decision)
              │
              ▼
    2. Call check_adr_overlap
              │
       ┌──────┴─────────────────────────────┐
       ▼                                    ▼
[DUPLICATE_RISK / CONFLICT_RISK]    [EXTENSION_CANDIDATE / NOVEL]
       │                                    │
       ▼                                    ▼
  HALT File Creation                  Proceed to Draft
  - If DUPLICATE: Enrich existing     - If EXTENSION: Add extends: [ID]
  - If CONFLICT: Require RFC amend    - If NOVEL: Follow standard MADR template
```

---

## Step-by-Step Procedure

### 1. Formulate Proposal Core

Deconstruct the proposed architectural direction into three clean components:
- `title`: Concise title of the proposed architecture decision.
- `context`: Problem statement, constraints, operational drivers, and background.
- `decision`: Concrete technical decision, chosen technologies, and lifecycle standard.

### 2. Invoke Overlap Check

Execute the `check_adr_overlap` tool via MCP:

```json
{
  "title": "<proposed title>",
  "context": "<problem statement and background>",
  "decision": "<concrete technical decision>",
  "threshold": 0.50,
  "top_k": 3
}
```

### 3. Evaluate Diagnostic Verdict

Act strictly based on the diagnostic `verdict`:

- **`DUPLICATE_RISK`**:
  1. HALT net-new ADR authoring immediately. Do not create a new markdown file.
  2. Call `get_adr` using the matched ADR ID to inspect the existing decision.
  3. Inform the user that canonical prior art already exists.
  4. Propose updating or enriching the existing record rather than creating a duplicate.

- **`CONFLICT_RISK`**:
  1. HALT net-new ADR authoring.
  2. Call `get_adr` with the conflicting record ID.
  3. Detail the exact contradiction to the user.
  4. If the conflict is intentional, formulate an RFC supersession proposal (`OBSOLETES`) or an amendment (`AMENDS`). Do not create an unharmonized conflicting record.

- **`EXTENSION_CANDIDATE`**:
  1. Proceed with drafting the decision document.
  2. Add the matched record to the frontmatter under `extends: [<matched_id>]`.
  3. Explicitly reference the foundational ADR in the Context and Problem Statement section.

- **`NOVEL`**:
  1. Proceed with creating the net-new ADR using the standard MADR template.
  2. Run `search_adrs` with key architectural keywords to find peripheral records to link as informational citations.

---

## Verification & Tool Reference

Tool | Purpose | Arguments
:--- | :--- | :---
`check_adr_overlap` | Evaluates proposed ADR components against indexed catalog | `title`, `context`, `decision`, `threshold`, `top_k`
`get_adr` | Retrieves full text, sections, and metadata of existing ADR | `id`
`search_adrs` | Finds relevant architectural prior art via vector similarity | `query`, `top_k`, `threshold`, `status`
`list_adrs` | Lists all indexed ADRs with statuses and dates | `status`
