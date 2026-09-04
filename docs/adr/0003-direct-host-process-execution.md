# ADR-0003: Direct Host Process Execution on Persistent Instances

* Status: superseded by [ADR-0015](0015-declarative-gitops-continuous-delivery.md)
* Deciders: Core Systems Team, Platform Operations
* Date: 2024-02-05
Technical Story: PLAT-112
* Category: Deployment Infrastructure
* Superseded by: ADR-0015

## Context and Problem Statement

Services were initially deployed as native systemd background daemons directly on long-lived virtual machines provisioned via static configuration scripts. Over time, host operating system packages drifted, library version conflicts arose between co-located services, and rolling deployments caused intermittent service degradation during in-place daemon restarts.

## Decision Drivers

* Familiar operational paradigm using standard Linux systemd utilities
* Direct hardware access without virtualization overhead
* Minimal early architectural complexity

## Considered Options

* Option 1: Direct systemd host service management
* Option 2: Containerized process isolation on hosts

## Decision Outcome

Chosen option: "Direct systemd host service management", because Selected initially to minimize operational surface area before the platform team developed automated container orchestration capabilities.

### Positive Consequences

* Fast onboarding for engineers experienced with traditional Linux service debugging.
* Low initial infrastructure costs with no dedicated orchestration control planes.

### Negative Consequences

* Severe snowflake host syndrome across production fleets.
* Failed deployments required manual host rollbacks and high engineering intervention.

## Pros and Cons of the Options

### Option 1: Direct systemd host service management

Deploy compiled application artifacts directly onto bare VMs managed by systemd units.

* Good, because Low runtime memory overhead
* Good, because Familiar debugging via journalctl and systemctl
* Bad, because Mutable host state causes insidious environment drift
* Bad, because Hard to isolate CPU, memory, and noisy neighbor processes

### Option 2: Containerized process isolation on hosts

Encapsulate services in OCI containers managed by a local container engine.

* Good, because Hermetic dependency encapsulation
* Good, because Predictable resource constraints per container
* Bad, because Introduces container engine daemon management on every VM host

## Links and Primary Sources

### Internal Platform Links
* [ADR-0015: Declarative GitOps Application Delivery](0015-declarative-gitops-continuous-delivery.md)

### Canonical Primary Sources
* [Systemd Architecture Documentation](https://systemd.io)

