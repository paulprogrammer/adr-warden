# ADR-0012: Hierarchical Dynamic Configuration Management

* Status: accepted
* Deciders: Platform Architecture WG, Core Systems Team
* Date: 2024-06-05
Technical Story: PLAT-180
* Category: Configuration Management
* Supersedes: ADR-0001
* Depends on: ADR-0015

## Context and Problem Statement

As determined in retrospective analysis of ADR-0001, static configuration files baked into images created intolerable deployment friction and drift. Applications required hierarchical configuration merging (global defaults, regional overrides, environment-specific overrides) capable of dynamic runtime reload for feature flags, operational circuit breakers, and rate limit thresholds without restarting pods.

## Decision Drivers

* Centralized, auditable configuration repository backed by GitOps workflows
* Hierarchical inheritance allowing safe global baseline defaults with targeted overrides
* Dynamic runtime parameter updates without restarting application pods

## Considered Options

* Option 1: Hierarchical External Config with GitOps Sync (External Secrets & ConfigMaps)
* Option 2: Distributed Key-Value Service (Consul / Etcd)

## Decision Outcome

Chosen option: "Hierarchical External Config with GitOps Sync (External Secrets & ConfigMaps)", because Supersedes ADR-0001. Git-driven configuration guarantees auditability and peer review, while volume projections ensure applications run resiliently from local filesystem buffers even during control plane blips.

### Positive Consequences

* Configuration changes are deployed independently of application container builds.
* Every production parameter modification has a traceable git commit author and review approval.
* Feature flags and traffic limits can be updated dynamically in seconds.

### Negative Consequences

* Application configuration parsing logic must support atomic hot-reloading without race conditions.
* Requires strict JSON Schema validation in the configuration git repository to prevent invalid data.

## Pros and Cons of the Options

### Option 1: Hierarchical External Config with GitOps Sync (External Secrets & ConfigMaps)

Maintain structured YAML configurations in a centralized git repository, syncing them into cluster ConfigMaps and injecting them via volume mounts with in-process file watch notifications.

* Good, because Git commit audit log for every parameter change
* Good, because Zero rebuilds required to adjust operational thresholds
* Good, because Automated hot-reloading for applications supporting file watcher hooks
* Bad, because Applications must be architected to handle asynchronous configuration reloads safely
* Bad, because Risk of malformed configuration syntax causing runtime crashes if not validated by schema CI

### Option 2: Distributed Key-Value Service (Consul / Etcd)

Query central KV store over HTTP/gRPC at runtime.

* Good, because Instant sub-second propagation across all instances
* Bad, because Introduces runtime hard dependency on KV store availability during network partitions
* Bad, because Complex distributed watch connection maintenance

## Links and Primary Sources

### Internal Platform Links
* [ADR-0001: Static File Runtime Configuration](0001-static-file-runtime-configuration.md)
* [ADR-0015: Declarative GitOps Continuous Delivery Architecture](0015-declarative-gitops-continuous-delivery.md)

### Canonical Primary Sources
* [Kubernetes ConfigMap Best Practices](https://kubernetes.io/docs/concepts/configuration/configmap/)

