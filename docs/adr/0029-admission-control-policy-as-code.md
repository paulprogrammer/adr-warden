# ADR-0029: Admission Control Policy-as-Code with Gatekeeper

* Status: accepted
* Deciders: Security Architecture WG, Platform Governance Guild
* Date: 2025-02-05
Technical Story: PLAT-310
* Category: Governance and Security
* Depends on: ADR-0016

## Context and Problem Statement

Despite publishing container security guidelines and resource quota best practices, engineering teams occasionally deployed pods with root user privileges, missing CPU/RAM limits, untrusted public container registries, or privileged Linux capabilities that jeopardized cluster stability and compliance.

## Decision Drivers

* Automated, preventive enforcement of security and resource guardrails before workloads deploy
* Policy-as-Code definitions versioned and tested in git repositories
* Shift-left policy validation in local developer workflows and CI pull requests

## Considered Options

* Option 1: Gatekeeper Open Policy Agent (OPA) Admission Webhooks
* Option 2: Post-Deployment Security Scanners (Async Polling)

## Decision Outcome

Chosen option: "Gatekeeper Open Policy Agent (OPA) Admission Webhooks", because Depends on ADR-0016. Preventative admission control ensures compliance policies are enforced deterministically at the front door rather than remediated reactively post-incident.

### Positive Consequences

* 100% of running production workloads adhere strictly to non-root UID execution (ADR-0016).
* Cluster resource starvation eliminated by mandating memory and CPU limits on every pod.
* Developers receive instant, actionable feedback in CI if deployment manifests violate policies.

### Negative Consequences

* Platform team must thoroughly test admission policies in staging to prevent breaking emergency deployments.
* Rego policy syntax requires specialized training for security engineers.

## Pros and Cons of the Options

### Option 1: Gatekeeper Open Policy Agent (OPA) Admission Webhooks

Deploy Gatekeeper validating admission webhooks in clusters. Policies written in Rego enforce rules: reject images not from enterprise registries, reject root UIDs, mandate memory limits, and require standard ownership labels.

* Good, because Prevents non-compliant manifests from ever entering the cluster control plane
* Good, because Standardized Rego policy language with rich unit testing frameworks
* Good, because Supports dry-run audit mode before switching to active rejection
* Bad, because Webhook failures can block cluster operations if not configured with failurePolicy: Ignore
* Bad, because Requires developers to understand admission rejection error messages

### Option 2: Post-Deployment Security Scanners (Async Polling)

Scan running cluster resources every hour and file Jira tickets for compliance violations.

* Good, because Zero risk of blocking legitimate deployments
* Bad, because Reactive posture: vulnerable or privileged pods run for hours before detection
* Bad, because Creates massive ticket backlog toil for security teams

## Links and Primary Sources

### Internal Platform Links
* [ADR-0015: Declarative GitOps Continuous Delivery Architecture](0015-declarative-gitops-continuous-delivery.md)
* [ADR-0016: Minimal Container Base Images and Build Security](0016-minimal-container-base-images-and-build-security.md)

### Canonical Primary Sources
* [Open Policy Agent Gatekeeper Documentation](https://open-policy-agent.github.io/gatekeeper/website/)

