# ADR-0001: Static File Runtime Configuration

* Status: superseded by [ADR-0012](0012-hierarchical-dynamic-configuration-management.md)
* Deciders: Platform Architecture WG, Core Infrastructure Team
* Date: 2024-01-15
Technical Story: PLAT-101
* Category: Configuration Management
* Superseded by: ADR-0012

## Context and Problem Statement

Initial platform deployments relied on environment-specific JSON and YAML configuration files baked directly into machine images or copied onto hosts during bootstrapping. As the fleet scaled across development, staging, and production environments, modifying a single timeout or connection string required rebuilding and re-provisioning host images, introducing operational friction and configuration drift.

## Decision Drivers

* Simplicity of local filesystem inspection
* Zero external runtime dependencies during service bootstrap
* Deterministic configuration state per machine deployment

## Considered Options

* Option 1: Bake static config files per environment into host images
* Option 2: Pass configuration solely through POSIX environment variables

## Decision Outcome

Chosen option: "Bake static config files per environment into host images", because Prioritized rapid initial bootstrap reliability and self-contained execution while operational footprint was limited to a single cloud region.

### Positive Consequences

* Services started deterministically without relying on network configuration servers.
* Configuration inspection was trivial using standard text editors and shell utilities.

### Negative Consequences

* Created significant configuration drift across long-running instances.
* Required full packaging pipeline execution for trivial parameter updates.

## Pros and Cons of the Options

### Option 1: Bake static config files per environment into host images

Package separate configuration bundles per environment directly in machine templates.

* Good, because Zero network call overhead during bootstrap
* Good, because Immune to remote service discovery outages
* Bad, because Requires full image rebuild to rotate non-secret parameters
* Bad, because Severe configuration drift across environments

### Option 2: Pass configuration solely through POSIX environment variables

Inject all parameters into host environments at invocation time.

* Good, because Adheres to Twelve-Factor App guidelines
* Good, because Easy to override in local testing
* Bad, because Lacks structural validation for nested schemas
* Bad, because Risk of accidental leakage in process dumps and logs

## Links and Primary Sources

### Internal Platform Links
* [ADR-0012: Hierarchical Dynamic Configuration Management](0012-hierarchical-dynamic-configuration-management.md)

### Canonical Primary Sources
* [Twelve-Factor App: Config](https://12factor.net/config)

