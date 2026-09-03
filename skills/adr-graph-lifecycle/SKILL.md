---
name: adr-graph-lifecycle
description: >-
  Navigates, traverses, and validates the Architecture Decision Knowledge Graph.
  Activate this skill when evaluating dependencies between ADRs, tracing decision supersession lineage,
  calculating downstream blast radius or impact before modifying an architectural standard,
  rendering Mermaid topology diagrams, or validating graph integrity prior to git commit or PR submission.
---

# ADR Graph Lifecycle & Topology Engine

Use this skill to inspect, traverse, and validate architectural relationships across active records in `docs/adr/`.

## Problem Statement

Architectural decisions form an interdependent web of foundational contracts, specialized extensions, and historical supersessions. When changes are made without traversing this topology, platform teams inherit broken references, circular dependencies, and split-brain standards where deprecated records continue to be cited as active baselines.

---

## Core Operational Procedures

### 1. Active Standard Lineage Resolution

Before citing, extending, or modifying an ADR, confirm whether it represents the current active standard:

1. Call `adr_graph_lineage` with the target ADR identifier:
   ```json
   { "id": "0001" }
   ```
2. Inspect the returned lineage report:
   - If `isActive` is `true`: The record is current. Proceed with citation or extension.
   - If `isActive` is `false`: The record is superseded. Identify the `activeStandardId` and re-target your proposal to build upon the active standard.

### 2. Upstream Dependency Verification

When drafting or reviewing an ADR that relies on existing platform infrastructure:

1. Call `adr_graph_dependencies`:
   ```json
   { "id": "0007" }
   ```
2. Review the dependency sequence:
   - Check `hasDeprecatedPrerequisite`: If true, halt and warn the user. Building on a deprecated prerequisite is an architectural smell.
   - Ensure all upstream prerequisites are currently in `accepted` status before proposing acceptance of the dependent ADR.

### 3. Downstream Blast Radius & Impact Audit

Before modifying, amending, or obsoleting an existing decision record:

1. Call `adr_graph_impact`:
   ```json
   { "id": "0002" }
   ```
2. Evaluate the blast radius report:
   - `directDependents`: Records with immediate hard dependencies (`DEPENDS_ON`).
   - `extensions`: Specialized implementations extending the baseline (`EXTENDS`, `AMENDS`).
   - `transitiveDependents`: Records impacted indirectly across deeper dependency chains.
   - `citations`: Informational cross-references that require review.
3. Formulate operational migration plans if any active dependents exist.

### 4. Pre-Commit Graph Validation Gate

Before committing changes to `docs/adr/` or opening a pull request:

1. Call `adr_graph_validate`:
   ```json
   {}
   ```
2. Evaluate the validation output:
   - **Fatal Errors (`valid: false`)**:
     - `DANGLING_REFERENCE`: Reference to non-existent ADR ID. Correct the ID or author the missing record.
     - `CYCLE_DETECTED`: Circular dependency in `DEPENDS_ON` or `OBSOLETES`. Refactor the dependency direction to break the cycle.
     - `STATUS_CONTRADICTION`: Split-brain status (e.g. accepted ADR marked obsolete by another accepted ADR). Update statuses to restore consistency.
   - **Warnings**:
     - `ORPHAN_RECORD`: Disconnected record. Determine whether it should extend a core standard or cite related decisions.
3. Do not proceed to commit if any fatal errors are returned.

### 5. Mermaid Architecture Visualization

To generate relationship diagrams for documentation or architectural reviews:

1. Call `adr_graph_mermaid`:
   ```json
   {
     "focus_id": "0001",
     "radius": 2
   }
   ```
2. Embed the generated `flowchart TD` block into your documentation or review notes.

---

## Tool Reference

Tool | Purpose | Arguments
:--- | :--- | :---
`adr_graph_lineage` | Traces supersession and active replacement chain | `id`
`adr_graph_impact` | Evaluates downstream blast radius, dependents, and citations | `id`
`adr_graph_dependencies` | Inspects upstream prerequisites in topological order | `id`
`adr_graph_validate` | Verifies integrity (cycles, broken links, status contradictions) | none
`adr_graph_mermaid` | Renders Mermaid relationship diagram | `focus_id`, `radius`
