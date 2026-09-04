# ADR-0011: Workload Identity Federation for Cloud Resources

* Status: accepted
* Deciders: Security Architecture WG, Cloud Infrastructure Team
* Date: 2024-05-22
Technical Story: PLAT-172
* Category: Identity and Access Management
* Required by: ADR-0007, ADR-0017

## Context and Problem Statement

Services running in container clusters previously authenticated to cloud resources using static service account keys or permanent API tokens stored in configuration files. Security audits identified that static keys had leaked into git histories or remained unrotated for months, presenting unacceptable exfiltration risks.

## Decision Drivers

* Complete elimination of long-lived, static cloud credentials
* Automated, cryptographically verifiable credential lifecycle using OpenID Connect (OIDC)
* Strict least-privilege role binding mapped to individual workload service accounts

## Considered Options

* Option 1: Workload Identity Federation via Service Account OIDC Tokens
* Option 2: Manual Service Account Key Rotation Cron Jobs

## Decision Outcome

Chosen option: "Workload Identity Federation via Service Account OIDC Tokens", because Eliminating static credentials is a foundational pillar of zero-trust cloud infrastructure. Projected OIDC tokens guarantee that compromised container filesystems yield no reusable static credentials.

### Positive Consequences

* Static cloud credential files were completely eradicated from all application repositories.
* Security audit compliance achieved 100% adherence for least-privilege cloud access.
* Credential rotation happens automatically without human intervention or application restarts.

### Negative Consequences

* Developers running workloads locally must use personal cloud authentication proxies.
* Misconfigured IAM trust policies cause immediate permission denied errors requiring specialized IAM triage.

## Pros and Cons of the Options

### Option 1: Workload Identity Federation via Service Account OIDC Tokens

Federate pod service accounts directly with Cloud IAM using projected OIDC tokens exchanged dynamically for short-lived cloud credentials.

* Good, because Zero long-lived secret keys stored in clusters or environment variables
* Good, because Credentials automatically expire within one hour
* Good, because Direct auditability linking cloud API calls to specific workload namespaces
* Bad, because Requires strict cloud IAM trust policy configuration per service
* Bad, because Unavailable on legacy clusters without OIDC provider endpoints

### Option 2: Manual Service Account Key Rotation Cron Jobs

Store static keys in cluster secrets and rotate them periodically via automated scripts.

* Good, because Works with legacy services without code changes
* Bad, because Still vulnerable to token exfiltration during the active window
* Bad, because Complex failure modes when rotation jobs fail silently

## Links and Primary Sources

### Internal Platform Links
* [ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy](0007-service-mesh-mtls-and-traffic-policy.md)
* [ADR-0017: Ephemeral Secrets Management via Dynamic Vault Leases](0017-ephemeral-secrets-management-vault.md)

### Canonical Primary Sources
* [Kubernetes Workload Identity Federation Guide](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

