# ADR-0017: Ephemeral Secrets Management via Dynamic Vault Leases

* Status: accepted
* Deciders: Security Architecture WG, Platform Operations
* Date: 2024-08-14
Technical Story: PLAT-218
* Category: Secrets Management
* Depends on: ADR-0011

## Context and Problem Statement

Application database credentials, third-party API keys, and encryption secrets were managed as static strings committed to encrypted repositories or stored in Kubernetes Secret objects. Because database passwords never changed unless an engineer performed manual rotation, any leaked credential provided indefinite access to production databases.

## Decision Drivers

* Dynamic, just-in-time credential generation with short-lived TTLs (Time-To-Live)
* Automated revocation upon pod termination or lease expiration
* Centralized audit logging for every secret read and lease renewal event

## Considered Options

* Option 1: HashiCorp Vault Dynamic Secrets with Kubernetes Agent Injection
* Option 2: Sealed Secrets (Bitnami SealedSecrets in Git)

## Decision Outcome

Chosen option: "HashiCorp Vault Dynamic Secrets with Kubernetes Agent Injection", because Depends on ADR-0011. Static credentials represent persistent liabilities. Dynamic leases force continuous automated credential rotation and limit compromise windows to under one hour.

### Positive Consequences

* Eliminated shared static database master accounts from application configurations.
* Complete visibility into which specific pods requested database credentials and when.
* Instant revocation capability for suspect pods without restarting database instances.

### Negative Consequences

* High operational burden maintaining an enterprise Vault cluster with multi-region replication.
* Application connection pools (e.g., HikariCP, Knex) must support dynamic credential rotation without dropped queries.

## Pros and Cons of the Options

### Option 1: HashiCorp Vault Dynamic Secrets with Kubernetes Agent Injection

Deploy Vault Agent sidecars that authenticate via Kubernetes Service Account OIDC tokens, generating unique, temporary database credentials valid for one hour and automatically renewing leases.

* Good, because Zero static database passwords exist anywhere in the infrastructure
* Good, because Compromised credentials automatically revoke within 60 minutes
* Good, because Granular audit logging captures exact identity and timestamp of all secret accesses
* Bad, because Vault cluster becomes a tier-0 mission-critical operational dependency
* Bad, because Applications must renew connection pools when credentials rotate dynamically

### Option 2: Sealed Secrets (Bitnami SealedSecrets in Git)

Encrypt static secrets with cluster public keys and store encrypted manifests in git.

* Good, because Integrates smoothly with GitOps repositories
* Bad, because Still manages long-lived static credentials
* Bad, because Zero automated credential rotation or access audit logging

## Links and Primary Sources

### Internal Platform Links
* [ADR-0011: Workload Identity Federation for Cloud Resources](0011-workload-identity-federation.md)
* [ADR-0012: Hierarchical Dynamic Configuration Management](0012-hierarchical-dynamic-configuration-management.md)

### Canonical Primary Sources
* [HashiCorp Vault Dynamic Secrets Architecture](https://developer.hashicorp.com/vault/docs/secrets)

