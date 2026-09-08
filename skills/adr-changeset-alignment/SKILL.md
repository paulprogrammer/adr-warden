---
name: adr-changeset-alignment
description: >-
  Audits git changesets, pull requests, and modified code against indexed Architecture Decision Records (ADRs).
  Delineates between binding approved standards and proposed in-flight advisories. Resolves remote web URLs
  on GitHub and Azure DevOps without requiring local ADR copies.
---

# Changeset Alignment and Code Review Guard

Use this skill during code construction, pull request authoring, code review, or CI/CD pipelines to verify that application changes conform to published architecture decision records.

## Architecture Alignment Workflow

```
       [Git Changeset / PR Diff / Staged Files]
                         │
                         ▼
        1. Discover / Synchronize ADR Index
      (Remote HTTP index.json or local vector cache)
                         │
                         ▼
        2. Evaluate Changeset Alignment
       (warden align or MCP align_changeset)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
🔴 Binding Standards              🟡 In-Flight Proposals
 (Status: Accepted)                (Status: Proposed)
  - Mandatory compliance            - Early heads-up advisory
  - Blocks breaking changes         - Prevents duplicate/wasted effort
        │                                 │
        ▼                                 ▼
[Review & Remediate]              [Consult PR Deciders]
```

---

## When to Activate This Skill

- **Pre-Commit / Pre-Push**: Developers checking if a new dependency, database migration, or architectural pattern adheres to company decisions.
- **Code Review / PR Bot**: Reviewers auditing whether pull requests intersect with existing accepted ADRs or pending proposals.
- **CI/CD Quality Gate**: Running automated architecture checks in Azure Pipelines or GitHub Actions.

---

## Step-by-Step Procedure

### 1. Configuration in Consumer Repositories

In downstream application or microservice repositories where ADRs are stored centrally in another Git repo, create a `.wardenrc.json`:

```json
{
  "remote": {
    "provider": "github",
    "owner": "my-org",
    "repository": "architecture-adrs",
    "branch": "main",
    "baseDir": "docs/adr",
    "indexUrl": "https://raw.githubusercontent.com/my-org/architecture-adrs/main/.adr-cache/index.json"
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
    "repository": "architecture",
    "branch": "main",
    "baseDir": "docs/adr",
    "indexUrl": "https://dev.azure.com/my-org/PlatformCore/_apis/git/repositories/architecture/items?path=%2F.adr-cache%2Findex.json&$format=octetStream&api-version=6.0"
  }
}
```

### 2. Running Alignment Checks via CLI

```bash
# Audit working tree or staged changes
warden align

# Audit comparison against main branch
warden align --diff origin/main...HEAD

# CI/CD gate: fail build if binding architectural standards are violated
warden align --diff origin/main...HEAD --fail-on-noncompliance

# Output structured JSON for automation or PR commenting
warden align --json
```

### 3. Reviewing Alignment Output

The tool classifies matches into distinct categories:

1. **🔴 Binding Architectural Standards** (Status: `accepted`):
   - These are non-negotiable architectural contracts.
   - Example: An ADR mandating Redis client configuration or Kafka partitioning keys.
   - Action: Ensure code changes strictly follow the decisions and constraints.

2. **🟡 In-Flight Proposals** (Status: `proposed`):
   - These are architecture decisions currently under team review or RFC.
   - Example: A proposed shift to OpenTelemetry or a proposed auth token schema.
   - Action: Read the web URL to review the proposal and verify your construction doesn't contradict the future standard.

3. **📜 Historical Records** (Status: `superseded` / `deprecated`):
   - Outdated standards with pointers to their canonical replacement.

---

## Using via MCP Tools

When using an AI coding assistant (Cursor, Gemini CLI, Claude Desktop, Antigravity):

1. Launch MCP server in construction mode:
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

2. Request review:
   > *"Run `align_changeset` for my staged changes and verify that I am complying with all approved architectural decisions."*
