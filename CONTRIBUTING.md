# Contributing to ADR Search and Lifecycle Engine

## Overview

We welcome contributions to improve the vector search engine, knowledge graph traversal algorithms, and MCP tools. This project follows a standard fork-and-pull-request workflow.

---

## Development Prerequisites

- Node.js (version 20 or higher)
- `pnpm` (version 9 or 11)

---

## Workflow Steps

1. **Fork the Repository**:
   Fork the repository to your personal account.

2. **Clone and Branch**:
   Clone your fork locally and create a dedicated feature branch from `main`:
   ```bash
   git clone <your-fork-url>
   cd adr-search-and-lifecycle
   git checkout -b feat/my-improvement
   ```

3. **Install Dependencies**:
   ```bash
   pnpm install
   ```

4. **Implement Changes and Verify**:
   Implement changes in `src/`, `skills/`, or documentation. Ensure that TypeScript compilation and the automated test suite pass with zero errors before committing:
   ```bash
   pnpm run build
   pnpm test
   ```

5. **Commit with Conventional Messages**:
   Structure commit messages following the Conventional Commits specification:
   - `feat(scope): new capability or tool`
   - `fix(scope): bug fix or error correction`
   - `docs(scope): documentation or skill updates`
   - `chore(scope): build, dependency, or configuration maintenance`

6. **Push and Submit Pull Request**:
   Push your branch to your fork and open a Pull Request targeting the `main` branch:
   ```bash
   git push origin feat/my-improvement
   ```

---

## Contribution Rules

- **Automated Verification**: Pull requests with failing tests or broken TypeScript compilation will not be merged. Always verify stability locally via `pnpm test`.
- **Test Coverage**: Add corresponding unit or integration tests under `test/` for any new tools, parsing rules, or graph traversal algorithms.
- **Licensing**: All contributions are submitted under the project [MIT License](LICENSE).
