# Architecture Decision Records (ADRs)

This directory houses 30 sample Architecture Decision Records formatted using the [MADR 3.0 (Markdown Architectural Decision Records)](https://adr.github.io/madr/) specification. All records are sanitized of proprietary or customer-specific details and represent a realistic, production-grade cloud platform engineering ecosystem.

This repository serves as a live demonstration environment to learn how to search, validate, and query architecture decision lifecycles using **ADR Warden** (`warden` / `adr-warden`).

## Guided Tutorial: Using ADR Warden with Sample Records

### 1. Build and Index the Decision Catalog

Index the ADR catalog into a local embedding cache. ADR Warden parses markdown metadata, extracts semantic sections, and generates incremental embeddings:

```bash
# Index the local docs/adr directory
warden index docs/adr
```

### 2. Semantic Vector Search

Query the architecture repository using natural language questions. Vector search matches conceptual relevance even when keywords differ:

```bash
# Find decisions regarding stateless application architecture
warden search "maintaining stateless services and external session state"

# Query disaster recovery topologies
warden search "failover recovery time objectives multi-region"

# Query zero-trust and internal encryption
warden search "mutual TLS encryption between services"
```

### 3. Pre-Authoring Prior Art & Overlap Guard

Before authoring a new ADR, verify whether the catalog already contains conflicting, duplicate, or predecessor decisions:

```bash
# Check a proposed decision before drafting
warden check \
  -t "Adopt RabbitMQ for asynchronous event notifications" \
  -c "Need asynchronous message broker for order events" \
  -d "Deploy RabbitMQ cluster for publish-subscribe events"
```

*The overlap analyzer will detect that ADR-0019 already chose Apache Kafka and that ADR-0006 was superseded, advising you to extend ADR-0019 rather than creating an architectural split-brain.*

### 4. Knowledge Graph Validation

Verify graph integrity across all 30 records to ensure zero dangling references, zero cyclic dependencies, and zero split-brain decisions:

```bash
warden graph validate
```

### 5. Supersession Lineage Tracing

Trace the evolution of superseded architectural standards from their inception to the active modern replacement:

```bash
# Trace how ADR-0001 (Static Files) evolved into ADR-0012 (Dynamic GitOps Config)
warden graph lineage 0001

# Trace how ADR-0003 (Systemd Hosts) evolved into ADR-0015 (GitOps Delivery)
warden graph lineage 0003
```

### 6. Blast Radius and Downstream Impact Analysis

Evaluate the downstream ripple effect before proposing changes to a foundational decision:

```bash
# Analyze blast radius of modifying ADR-0004 (Immutable Container Promotion)
warden graph impact 0004

# Analyze dependencies of ADR-0015 (GitOps Application Delivery)
warden graph impact 0015
```

### 7. Upstream Prerequisite Inspection

Inspect the prerequisite architectural standards required before implementing an advanced capability:

```bash
# Inspect upstream dependencies required for Disaster Recovery (ADR-0027)
warden graph deps 0027

# Inspect prerequisites for Canary Deployments (ADR-0013)
warden graph deps 0013
```

### 8. Export Architecture Topology Diagrams

Export the entire decision lineage graph as a Mermaid diagram:

```bash
# Print full architecture graph in Mermaid syntax
warden graph mermaid
```

### 9. Model Context Protocol (MCP) Server Integration

Expose all search and lifecycle capabilities directly to AI agents (such as Antigravity, Claude Desktop, or Cursor) over standard I/O:

```bash
warden mcp
```

Configure in your project's `.mcp.json` or `.agents/mcp_config.json`:

```json
{
  "mcpServers": {
    "adr-warden": {
      "command": "warden",
      "args": ["mcp"],
      "env": {
        "ADR_DIRS": "./docs/adr",
        "ADR_CACHE_DIR": "./.adr-cache"
      }
    }
  }
}
```

## Catalog Index (30 Records)

| ID | Title | Status | Category | Lineage & Dependencies |
|:---|:------|:-------|:---------|:-----------------------|
| [ADR-0001](0001-static-file-runtime-configuration.md) | Static File Runtime Configuration | `superseded` | Configuration Management | Superseded by: [0012](#) |
| [ADR-0002](0002-semantic-versioning-and-release-tagging.md) | Semantic Versioning and Release Tagging Standards | `accepted` | Release Engineering | - |
| [ADR-0003](0003-direct-host-process-execution.md) | Direct Host Process Execution on Persistent Instances | `superseded` | Deployment Infrastructure | Superseded by: [0015](#) |
| [ADR-0004](0004-immutable-digest-container-promotion.md) | Immutable Digest Container Promotion Lifecycle | `accepted` | Release Engineering | Depends on: [0002](#) |
| [ADR-0005](0005-stateless-service-session-externalization.md) | Stateless Service Architecture and Session Externalization | `accepted` | Architecture Patterns | - |
| [ADR-0006](0006-batch-cron-data-synchronization.md) | Batch Cron-Based Data Synchronization Between Services | `superseded` | Data Integration | Superseded by: [0019](#) |
| [ADR-0007](0007-service-mesh-mtls-and-traffic-policy.md) | Service Mesh Mutual TLS and Zero-Trust Traffic Policy | `accepted` | Networking and Security | Depends on: [0004](#), [0011](#) |
| [ADR-0008](0008-monolithic-shared-relational-database.md) | Monolithic Shared Relational Database Schema | `superseded` | Persistence Architecture | Superseded by: [0022](#) |
| [ADR-0009](0009-centralized-structured-json-logging.md) | Centralized Structured JSON Logging Standards | `accepted` | Observability | - |
| [ADR-0010](0010-http-rest-openapi-contracts.md) | HTTP REST with OpenAPI Specification Contracts | `accepted` | API Design | - |
| [ADR-0011](0011-workload-identity-federation.md) | Workload Identity Federation for Cloud Resources | `accepted` | Identity and Access Management | - |
| [ADR-0012](0012-hierarchical-dynamic-configuration-management.md) | Hierarchical Dynamic Configuration Management | `accepted` | Configuration Management | Supersedes: [0001](#); Depends on: [0015](#) |
| [ADR-0013](0013-progressive-delivery-and-canary-rollouts.md) | Progressive Delivery and Canary Traffic Splitting | `accepted` | Deployment Infrastructure | Depends on: [0015](#); Extends: [0007](#) |
| [ADR-0014](0014-rate-limiting-and-api-gateway-enforcement.md) | Edge API Gateway Rate Limiting and WAF Policy | `accepted` | Edge and Security | Extends: [0010](#) |
| [ADR-0015](0015-declarative-gitops-continuous-delivery.md) | Declarative GitOps Continuous Delivery Architecture | `accepted` | Deployment Infrastructure | Supersedes: [0003](#); Depends on: [0004](#) |
| [ADR-0016](0016-minimal-container-base-images-and-build-security.md) | Minimal Container Base Images and Build Security | `accepted` | Container Security | Depends on: [0004](#) |
| [ADR-0017](0017-ephemeral-secrets-management-vault.md) | Ephemeral Secrets Management via Dynamic Vault Leases | `accepted` | Secrets Management | Depends on: [0011](#) |
| [ADR-0018](0018-grpc-protocol-buffers-internal-rpc.md) | gRPC Protocol Buffers for Low-Latency Internal RPC | `accepted` | API Design | Extends: [0010](#) |
| [ADR-0019](0019-event-driven-streaming-architecture-kafka.md) | Asynchronous Event Streaming Architecture via Apache Kafka | `accepted` | Data Integration | Supersedes: [0006](#) |
| [ADR-0020](0020-distributed-saga-pattern-coordination.md) | Distributed Saga Pattern for Cross-Service Coordination | `accepted` | Distributed Systems | Depends on: [0019](#) |
| [ADR-0021](0021-read-heavy-query-caching-redis.md) | Distributed Read-Through Query Caching via Redis | `accepted` | Caching and Performance | Depends on: [0005](#) |
| [ADR-0022](0022-expand-contract-database-migrations.md) | Expand-Contract Schema Evolution for Zero Downtime | `accepted` | Persistence Architecture | Supersedes: [0008](#) |
| [ADR-0023](0023-dead-letter-queue-and-poison-message-handling.md) | Dead-Letter Queue and Poison Message Processing | `accepted` | Data Integration | Extends: [0019](#) |
| [ADR-0024](0024-idempotent-api-request-handling.md) | Idempotent API Request Processing with Distributed Locks | `accepted` | API Design | Depends on: [0005](#); Extends: [0010](#) |
| [ADR-0025](0025-opentelemetry-distributed-tracing-standards.md) | Distributed Tracing and OpenTelemetry Semantic Conventions | `accepted` | Observability | Depends on: [0007](#); Extends: [0009](#) |
| [ADR-0026](0026-modular-infrastructure-as-code-opentofu.md) | Modular Infrastructure as Code with OpenTofu | `accepted` | Infrastructure as Code | - |
| [ADR-0028](0028-edge-caching-and-global-cdn-delivery.md) | Edge Caching and Global Content Delivery Network | `accepted` | Edge and Performance | Extends: [0014](#) |
| [ADR-0027](0027-dual-region-disaster-recovery-topology.md) | Dual-Region Warm-Standby Disaster Recovery Topology | `accepted` | Reliability and Disaster Recovery | Depends on: [0015](#), [0022](#), [0026](#) |
| [ADR-0029](0029-admission-control-policy-as-code.md) | Admission Control Policy-as-Code with Gatekeeper | `accepted` | Governance and Security | Depends on: [0016](#) |
| [ADR-0030](0030-ephemeral-pull-request-preview-environments.md) | Ephemeral Pull Request Preview Environments | `proposed` | Developer Experience | Depends on: [0015](#) |

