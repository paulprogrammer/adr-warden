# ADR-0030: Ephemeral Pull Request Preview Environments

* Status: proposed
* Deciders: Developer Experience Guild, Platform Architecture WG
* Date: 2025-02-19
Technical Story: PLAT-320
* Category: Developer Experience
* Depends on: ADR-0015

## Context and Problem Statement

Development teams face significant bottlenecks waiting for shared staging environments to verify complex cross-service features, API contracts, and frontend user experiences. Code conflicts, dirty test data, and competing release trains in staging delay pull request reviews and degrade developer inner-loop velocity.

## Decision Drivers

* On-demand, isolated preview environments dynamically provisioned per pull request
* Automatic teardown and resource reclamation upon pull request merge or closure
* Cost-conscious ephemeral resource footprint using lightweight namespace isolation

## Considered Options

* Option 1: Ephemeral Kubernetes Namespaces via ArgoCD ApplicationSets
* Option 2: Dedicated Permanent Staging Environments per Team

## Decision Outcome

Chosen option: "Ephemeral Kubernetes Namespaces via ArgoCD ApplicationSets", because Depends on ADR-0015. Dynamic ephemeral namespaces maximize developer autonomy and testing velocity while ensuring idle compute resources are reclaimed automatically without human intervention.

### Positive Consequences

* Developers and product owners can verify feature branches in live preview URLs before merge.
* Eliminated scheduling contention and deployment collisions in shared staging environments.
* Automated TTL controllers prevent runaway cloud infrastructure expenditure.

### Negative Consequences

* Cluster autoscalers must accommodate dynamic capacity spikes when multiple PRs are active.
* Services with heavy data dependencies must utilize lightweight mock seeds in preview namespaces.

## Pros and Cons of the Options

### Option 1: Ephemeral Kubernetes Namespaces via ArgoCD ApplicationSets

When a PR is opened, an automated pipeline creates an ephemeral namespace (e.g., pr-124), deploys the branch container image, provisions mock backing services, and routes preview traffic via dedicated subdomains (pr-124.preview.internal).

* Good, because Zero staging environment contention; engineers test features in complete isolation
* Good, because Rapid stakeholder verification with dedicated preview URLs
* Good, because Automated cleanup deletes namespaces after 24 hours of inactivity or on PR merge
* Bad, because Increased cluster resource utilization from concurrent preview environments
* Bad, because Requires sophisticated mocking or sanitized shared baseline databases for backend dependencies

### Option 2: Dedicated Permanent Staging Environments per Team

Maintain persistent staging clusters for each individual engineering team.

* Good, because Static endpoints that never change
* Bad, because Extremely expensive idle infrastructure compute footprint
* Bad, because Still suffers from within-team staging lockouts and data contamination

## Links and Primary Sources

### Internal Platform Links
* [ADR-0012: Hierarchical Dynamic Configuration Management](0012-hierarchical-dynamic-configuration-management.md)
* [ADR-0015: Declarative GitOps Continuous Delivery Architecture](0015-declarative-gitops-continuous-delivery.md)
* [ADR-0026: Modular Infrastructure as Code with OpenTofu](0026-modular-infrastructure-as-code-opentofu.md)

### Canonical Primary Sources
* [ArgoCD ApplicationSet Controller: Pull Request Generator](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Pull-Request/)

