# ADR-0026: Modular Infrastructure as Code with OpenTofu

* Status: accepted
* Deciders: Cloud Infrastructure Team, Platform Architecture WG
* Date: 2024-12-18
Technical Story: PLAT-285
* Category: Infrastructure as Code
* Required by: ADR-0027

## Context and Problem Statement

Cloud resources (virtual networks, managed databases, IAM policies, DNS records) were historically provisioned through ad-hoc cloud console clicks or isolated bash scripts. This led to undocumented configuration drift, untracked security group modifications, and made provisioning identical staging environments impossible.

## Decision Drivers

* 100% declarative, auditable infrastructure versioned in git repositories
* Modular, reusable blueprints enforcing enterprise networking and security standards
* Automated continuous drift detection and state locking across team workflows

## Considered Options

* Option 1: Modular OpenTofu with Remote State Storage and Locking
* Option 2: Cloud-Specific Templating (AWS CloudFormation / Azure Bicep)

## Decision Outcome

Chosen option: "Modular OpenTofu with Remote State Storage and Locking", because Required by ADR-0027. OpenTofu provides open-source, vendor-neutral declarative infrastructure automation with robust module composability and cryptographic state locking.

### Positive Consequences

* Every cloud resource change is peer-reviewed in git pull requests with automated plan outputs.
* New staging and testing environments can be spun up from zero in under 30 minutes.
* Nightly drift detection pipelines catch and flag any manual console alterations.

### Negative Consequences

* Engineers must learn OpenTofu HCL and module composition paradigms.
* Secrets cannot be stored in plaintext within state files; requires integration with Vault (ADR-0017).

## Pros and Cons of the Options

### Option 1: Modular OpenTofu with Remote State Storage and Locking

Define all cloud infrastructure in OpenTofu modules stored in git. Remote state files are maintained in encrypted cloud storage with distributed DynamoDB/GCS locking. CI pipelines execute automated plan generation on PRs and apply upon merge.

* Good, because Completely open-source, MPL-2.0 licensed community tooling
* Good, because Verifiable pull-request plans before applying changes to production
* Good, because Enables deterministic multi-region environment instantiation
* Bad, because State file corruption risks if manual modifications occur out-of-band
* Bad, because Requires strict state management discipline and sensitive variable handling

### Option 2: Cloud-Specific Templating (AWS CloudFormation / Azure Bicep)

Use native cloud provider declarative templates.

* Good, because Native cloud support without external state storage
* Bad, because Locks the platform into a single cloud provider syntax
* Bad, because Inconsistent modularity and testing frameworks across multi-cloud integrations

## Links and Primary Sources

### Internal Platform Links
* [ADR-0011: Workload Identity Federation for Cloud Resources](0011-workload-identity-federation.md)
* [ADR-0027: Dual-Region Warm-Standby Disaster Recovery Topology](0027-dual-region-disaster-recovery-topology.md)

### Canonical Primary Sources
* [OpenTofu Project Documentation](https://opentofu.org/docs/)

