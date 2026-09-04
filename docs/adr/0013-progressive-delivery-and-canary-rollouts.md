# ADR-0013: Progressive Delivery and Canary Traffic Splitting

* Status: accepted
* Deciders: Release Engineering Guild, Site Reliability Engineering, Platform Architecture WG
* Date: 2024-06-19
Technical Story: PLAT-188
* Category: Deployment Infrastructure
* Depends on: ADR-0015
* Extends: ADR-0007

## Context and Problem Statement

Standard rolling deployments replaced healthy instances with newly deployed versions in batches. If a subtle bug, memory leak, or performance regression slipped through CI, 100% of production users were exposed to errors before alerts could trigger human rollback intervention, degrading system availability metrics.

## Decision Drivers

* Restrict blast radius of unverified releases to a small percentage of real production traffic
* Automated analysis of golden signals (HTTP 5xx errors, P99 latency, host restarts)
* Autonomous rollback without human intervention when statistical failure thresholds are exceeded

## Considered Options

* Option 1: Automated Canary Progressive Delivery (Flagger + Envoy Service Mesh)
* Option 2: Blue/Green Environment Switching

## Decision Outcome

Chosen option: "Automated Canary Progressive Delivery (Flagger + Envoy Service Mesh)", because Extends ADR-0007. Utilizing Envoy service mesh traffic routing rules orchestrated by Flagger enables automated, metric-gated rollouts with negligible human toil and verifiable blast radius containment.

### Positive Consequences

* Customer-impacting outages from deployment regressions dropped by over 80%.
* Engineers gain confidence deploying changes directly during daylight business hours.
* SRE teams are relieved from manual deployment monitoring duties.

### Negative Consequences

* Services must maintain forward and backward schema compatibility during the canary window.
* Canary evaluation requires meaningful production traffic volume to achieve statistical significance.

### Architecture Topology

```mermaid
graph LR
    User[Client Ingress] --> Mesh[Envoy Traffic Router]
    Mesh -->|95% Stable Traffic| Primary[App Version v1.4.0 (Primary)]
    Mesh -->|5% Canary Probe| Canary[App Version v1.5.0 (Canary)]
    Canary --> Metrics[Prometheus Metric Collector]
    Metrics -->|Error Rate < 0.1%| Controller[Flagger Canary Controller]
    Controller -->|Promote Step| Mesh
```

## Pros and Cons of the Options

### Option 1: Automated Canary Progressive Delivery (Flagger + Envoy Service Mesh)

Deploy new versions alongside production baselines, shifting traffic incrementally (5% -> 10% -> 25% -> 50% -> 100%) while continuously querying Prometheus metrics for anomalies.

* Good, because Minimizes user blast radius to less than 5% during bad deployments
* Good, because Zero human intervention required to abort and rollback faulty releases
* Good, because Statistically rigorous validation under true production traffic patterns
* Bad, because Requires dual deployment capacity during active canary evaluation windows
* Bad, because Increases release duration from 2 minutes to 15-20 minutes

### Option 2: Blue/Green Environment Switching

Maintain identical staging environment and switch 100% router traffic at once.

* Good, because Instant rollback by switching router back to blue environment
* Bad, because 100% of users are exposed simultaneously upon switch
* Bad, because Doubles continuous idle infrastructure compute costs

## Links and Primary Sources

### Internal Platform Links
* [ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy](0007-service-mesh-mtls-and-traffic-policy.md)
* [ADR-0015: Declarative GitOps Continuous Delivery Architecture](0015-declarative-gitops-continuous-delivery.md)

### Canonical Primary Sources
* [Flagger Progressive Delivery Documentation](https://flagger.app)

