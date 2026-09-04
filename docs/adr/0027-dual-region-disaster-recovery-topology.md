# ADR-0027: Dual-Region Warm-Standby Disaster Recovery Topology

* Status: accepted
* Deciders: Platform Architecture WG, Executive Risk Committee, SRE Lead
* Date: 2025-01-22
Technical Story: PLAT-300
* Category: Reliability and Disaster Recovery
* Depends on: ADR-0015, ADR-0022, ADR-0026

## Context and Problem Statement

A localized primary cloud datacenter power failure caused a four-hour platform outage. Executive risk governance mandated an auditable Disaster Recovery (DR) posture capable of fulfilling a Recovery Time Objective (RTO) of under 15 minutes and a Recovery Point Objective (RPO) of under 5 minutes without catastrophic data loss.

## Decision Drivers

* Guaranteed business continuity during regional cloud outages
* RTO < 15 minutes and RPO < 5 minutes for tier-1 transactional services
* Cost-conscious infrastructure footprint avoiding duplicate 100% idle active-active compute pools

## Considered Options

* Option 1: Warm-Standby Dual-Region Topology with Cross-Region Storage Replication
* Option 2: Active-Active Multi-Region Multi-Master Topology

## Decision Outcome

Chosen option: "Warm-Standby Dual-Region Topology with Cross-Region Storage Replication", because Depends on ADR-0015, ADR-0022, and ADR-0026. Warm standby delivers the optimal balance of verifiable recovery time, operational simplicity, and financial feasibility without the hairiness of active-active distributed write conflicts.

### Positive Consequences

* Established verifiable compliance with enterprise 15-minute RTO / 5-minute RPO business mandates.
* GitOps pipelines automatically deploy identical application releases to both regions simultaneously.
* Quarterly automated DR drills validate failover playbooks in production-like environments.

### Negative Consequences

* DNS failover propagation introduces a 2-5 minute client-side TTL delay.
* Data engineering teams must maintain playbooks for reconciling asynchronous replication gap records post-failover.

### Architecture Topology

```mermaid
graph TD
    User[Global Traffic DNS] -->|Primary Route: 100%| RegA[Region A (Primary - Active)]
    User -.->|Failover Route: 0%| RegB[Region B (Secondary - Warm Standby)]
    subgraph Region A
        RegA --> ComputeA[Active Pod Fleet]
        ComputeA --> DbA[(Primary DB)]
    end
    subgraph Region B
        RegB --> ComputeB[Minimal Standby Fleet - 10%]
        ComputeB -.-> DbB[(Cross-Region Read Replica)]
    end
    DbA -->|Async Replication (RPO < 2m)| DbB
```

## Pros and Cons of the Options

### Option 1: Warm-Standby Dual-Region Topology with Cross-Region Storage Replication

Operate primary compute in Region A. Maintain a secondary Region B with minimum baseline infrastructure (10% compute capacity, replicated storage, automated GitOps deployment sync, and cross-region asynchronous database read replicas). During failover, promote database replica to primary and autoscale compute.

* Good, because Fulfills RTO < 15min and RPO < 5min targets reliably
* Good, because Limits disaster recovery infrastructure costs to approximately 30% above single-region footprint
* Good, because GitOps (ADR-0015) guarantees secondary region configuration matches primary identically
* Bad, because Asynchronous replication window means up to 1-2 minutes of recent transactions may require reconciliation
* Bad, because Requires scheduled quarterly disaster recovery failover drill tests

### Option 2: Active-Active Multi-Region Multi-Master Topology

Run 50/50 traffic split simultaneously across both regions with distributed multi-master databases (e.g., CockroachDB / Spanner).

* Good, because Near-zero RTO failover by switching DNS weights
* Bad, because Massive operational complexity managing multi-master database conflict resolution
* Bad, because High cross-region latency overhead on every transactional write

## Links and Primary Sources

### Internal Platform Links
* [ADR-0015: Declarative GitOps Continuous Delivery Architecture](0015-declarative-gitops-continuous-delivery.md)
* [ADR-0022: Expand-Contract Schema Evolution for Zero Downtime](0022-expand-contract-database-migrations.md)
* [ADR-0026: Modular Infrastructure as Code with OpenTofu](0026-modular-infrastructure-as-code-opentofu.md)

### Canonical Primary Sources
* [AWS / Cloud Disaster Recovery Architectures](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html)

