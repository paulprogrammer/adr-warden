# ADR-0002: Semantic Versioning and Release Tagging Standards

* Status: accepted
* Deciders: Release Engineering Guild, Platform Architecture WG
* Date: 2024-01-22
Technical Story: PLAT-104
* Category: Release Engineering
* Required by: ADR-0004, ADR-0015

## Context and Problem Statement

Engineering teams previously utilized inconsistent release identifiers ranging from arbitrary date stamps to sequential build numbers and commit hashes. Downstream consumer services had no automated mechanism to determine whether an updated shared library, container image, or API client contained non-breaking bug fixes, backward-compatible additions, or breaking interface contracts.

## Decision Drivers

* Deterministic compatibility contract for shared libraries and service contracts
* Automated dependency update gating and continuous deployment safety
* Clear audit trails between git tags, packages, and deployed artifacts

## Considered Options

* Option 1: Semantic Versioning 2.0.0 (MAJOR.MINOR.PATCH)
* Option 2: Calendar Versioning (CalVer YYYY.MM.MICRO)

## Decision Outcome

Chosen option: "Semantic Versioning 2.0.0 (MAJOR.MINOR.PATCH)", because SemVer provides a verifiable contract between producers and consumers. Coupled with conventional commits, automated CI tooling can bump patch and minor versions deterministically without manual release council gates.

### Positive Consequences

* Automated dependency managers can safely auto-merge patch and minor updates.
* Release tags map 1-to-1 to verifiable git commits and immutable artifact bundles.

### Negative Consequences

* Developers must categorize breaking changes strictly; accidental breaking changes necessitate immediate major bumps.
* Requires enforcing conventional commits in pull request validation pipelines.

## Pros and Cons of the Options

### Option 1: Semantic Versioning 2.0.0 (MAJOR.MINOR.PATCH)

Standardized SemVer format indicating breaking changes (MAJOR), compatible features (MINOR), and fixes (PATCH).

* Good, because Universal ecosystem tooling support
* Good, because Predictable risk assessment for dependency updates
* Bad, because Requires strict API boundary discipline from developers
* Bad, because Requires enforcement in automated pull request linters

### Option 2: Calendar Versioning (CalVer YYYY.MM.MICRO)

Version based on release calendar dates.

* Good, because Immediately communicates age of deployed software
* Good, because Intuitive for scheduled release trains
* Bad, because Conveys zero structural information regarding interface compatibility
* Bad, because Dangerous for automated dependency resolution

## Links and Primary Sources

### Internal Platform Links
* [ADR-0004: Immutable Digest Container Promotion Lifecycle](0004-immutable-digest-container-promotion.md)

### Canonical Primary Sources
* [Semantic Versioning 2.0.0 Specification](https://semver.org)

