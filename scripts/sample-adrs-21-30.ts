import type { AdrDef } from './sample-adrs-1-10.js';

export const ADRS_21_TO_30: AdrDef[] = [
  {
    id: '0021',
    slug: 'read-heavy-query-caching-redis',
    title: 'Distributed Read-Through Query Caching via Redis',
    status: 'accepted',
    deciders: ['Data Platform WG', 'Core Systems Team'],
    date: '2024-10-09',
    story: 'PLAT-248',
    category: 'Caching and Performance',
    dependsOn: ['0005'],
    context: 'High-frequency read queries for product catalog definitions, regional tax matrices, and currency exchange rates placed unsustainable query load on primary relational databases, driving database CPU above 85% and causing connection pool starvation during marketing events.',
    drivers: [
      'Sub-5ms query response times for read-heavy static and semi-static reference data',
      'Shield primary relational databases from repetitive read spikes',
      'Deterministic cache invalidation preventing stale data propagation',
    ],
    options: [
      {
        name: 'Cache-Aside with Redis Cluster and TTL Jitter',
        description: 'Applications query Redis first; on cache miss, query the database, populate Redis with a randomized TTL jitter (e.g., 300s +/- 30s), and return the result. Asynchronous event subscribers invalidate specific keys upon updates.',
        pros: ['Reduces database read query load by over 75%', 'TTL jitter prevents cache stampede (thundering herd) upon expiration', 'Resilient: database remains accessible if cache experiences temporary hiccups'],
        cons: ['Applications must manage cache serialization and miss logic', 'Potential for transient eventual consistency windows if invalidation events lag'],
      },
      {
        name: 'Relational Database Read-Replica Pool Scaling',
        description: 'Scale horizontal PostgreSQL read replicas behind a connection pool proxy (PgBouncer).',
        pros: ['Transparent to application code without caching layer logic'],
        cons: ['High infrastructure expense scaling multi-gigabyte database replicas', 'Replication lag still introduces stale read conditions under heavy write loads'],
      },
    ],
    chosenOption: 'Cache-Aside with Redis Cluster and TTL Jitter',
    rationale: 'Depends on ADR-0005. Leveraging the existing enterprise Redis tier for cache-aside query offloading dramatically improves P99 query latency while drastically cutting relational database compute costs.',
    positiveConsequences: [
      'Primary database CPU dropped from 85% peak to under 25% during major traffic spikes.',
      'P99 read latency for catalog data dropped from 65ms to 2.8ms.',
      'Randomized TTL jitter eliminated thundering herd cache stampedes.',
    ],
    negativeConsequences: [
      'Engineers must ensure all data mutations publish cache invalidation signals.',
      'Increases operational sizing requirements for the distributed Redis cluster.',
    ],
    links: [
      { text: 'ADR-0005: Stateless Service Architecture and Session Externalization', url: '0005-stateless-service-session-externalization.md', category: 'internal' },
      { text: 'ADR-0022: Expand-Contract Schema Evolution for Zero Downtime', url: '0022-expand-contract-database-migrations.md', category: 'internal' },
      { text: 'Redis Caching Patterns and Best Practices', url: 'https://redis.io/docs/manual/client-side-caching/', category: 'canonical' },
    ],
  },
  {
    id: '0022',
    slug: 'expand-contract-database-migrations',
    title: 'Expand-Contract Schema Evolution for Zero Downtime',
    status: 'accepted',
    deciders: ['Data Architecture WG', 'Release Engineering Guild'],
    date: '2024-10-23',
    story: 'PLAT-255',
    category: 'Persistence Architecture',
    supersedes: ['0008'],
    requiredBy: ['0027'],
    context: 'As analyzed in ADR-0008, destructive schema migrations (renaming columns, dropping fields, changing data types) on shared relational databases required maintenance downtime windows. When services deployed in rolling waves, older running pods crashed when encountering unexpected schema changes introduced by newer database migrations.',
    drivers: [
      'Continuous deployment without scheduled maintenance or downtime windows',
      'Backward and forward database schema compatibility across rolling deployment phases',
      'Zero locking of high-volume transactional tables during migration execution',
    ],
    options: [
      {
        name: 'Three-Phase Expand-and-Contract Migration Pattern',
        description: 'Decompose all schema changes into three discrete releases: 1) Expand: add new nullable column/table and write to both old and new; 2) Migrate: backfill existing data; 3) Contract: update readers to new column, stop dual-writing, and drop legacy column in a subsequent release.',
        pros: ['Guarantees zero downtime: both old and new application versions run simultaneously', 'Safe rollbacks at any point without data corruption', 'Enforces decoupled schema evolution across continuous deployment pipelines'],
        cons: ['Increases release cycle overhead: schema changes span multiple sequential pull requests', 'Requires dual-writing logic during transitional migration phases'],
      },
      {
        name: 'In-Place Direct Migrations with Maintenance Downtime Windows',
        description: 'Lock tables and apply DDL mutations during scheduled weekend maintenance periods.',
        pros: ['Simpler one-step migration scripts without dual-write complexity'],
        cons: ['Unacceptable customer downtime violating 99.95% availability SLAs', 'High operational stress during rollback failures'],
      },
    ],
    chosenOption: 'Three-Phase Expand-and-Contract Migration Pattern',
    rationale: 'Supersedes ADR-0008. Continuous delivery requires that database schemas and application code deploy asynchronously. Expand-and-contract eliminates database maintenance windows entirely.',
    positiveConsequences: [
      'Eliminated scheduled maintenance downtime across all production databases.',
      'Deployment rollbacks become safe and non-destructive since old columns remain intact during releases.',
      'Database DDL locks are restricted to non-blocking additive operations.',
    ],
    negativeConsequences: [
      'Developers must plan schema evolutions across a minimum of two separate release cycles.',
      'Temporary database storage overhead while duplicate columns are maintained during backfills.',
    ],
    diagram: `graph TD
    Phase1[Phase 1: Expand] -->|Add new column as nullable; dual-write| AppV1[App v1.0 & v1.1 Compatible]
    Phase1 --> Phase2[Phase 2: Backfill Data]
    Phase2 --> Phase3[Phase 3: Contract]
    Phase3 -->|Switch reads to new column; drop old column| AppV2[App v2.0 Exclusively]
    style Phase1 fill:#e8f5e9,stroke:#43a047
    style Phase3 fill:#fff3e0,stroke:#fb8c00`,
    links: [
      { text: 'ADR-0008: Monolithic Shared Relational Database Schema', url: '0008-monolithic-shared-relational-database.md', category: 'internal' },
      { text: 'ADR-0027: Dual-Region Warm-Standby Disaster Recovery Topology', url: '0027-dual-region-disaster-recovery-topology.md', category: 'internal' },
      { text: 'Refactoring Databases: Evolutionary Database Design', url: 'https://martinfowler.com/articles/evodb.html', category: 'canonical' },
    ],
  },
  {
    id: '0023',
    slug: 'dead-letter-queue-and-poison-message-handling',
    title: 'Dead-Letter Queue and Poison Message Processing',
    status: 'accepted',
    deciders: ['Distributed Systems WG', 'Data Platform WG'],
    date: '2024-11-06',
    story: 'PLAT-262',
    category: 'Data Integration',
    extends: ['0019'],
    context: 'When Kafka consumer services encountered corrupt payloads, unexpected null values, or unhandled runtime exceptions, the consumer thread crashed and restarted. Upon restart, it re-read the exact same offset, triggering an infinite crash loop that stalled the entire consumer group and blocked subsequent valid messages across that partition.',
    drivers: [
      'Prevent poison pill messages from halting consumer group partition processing',
      'Deterministic retry policies with bounded exponential backoff and jitter',
      'Isolation of unprocessable messages in a durable dead-letter topic for inspection',
    ],
    options: [
      {
        name: 'Retry Topic Hierarchy with Dead-Letter Queue (DLQ)',
        description: 'Failed messages are routed through sequential retry topics with progressive backoff delays (e.g., topic.retry.10s, topic.retry.1m, topic.retry.5m). Upon exceeding maximum retry thresholds, messages are routed to topic.dlq alongside diagnostic failure headers.',
        pros: ['Unblocks the primary partition immediately for downstream healthy traffic', 'Transient downstream outages self-heal through scheduled retry queues', 'Failed messages are preserved indefinitely with error context for administrative inspection'],
        cons: ['Can alter strict message processing order for records routed to retry queues', 'Increases Kafka partition and topic count management overhead'],
      },
      {
        name: 'Fail-fast and commit offset (Drop on Error)',
        description: 'Log the error and commit the offset to continue processing.',
        pros: ['Zero additional topic infrastructure required', 'Primary topic partition never stalls'],
        cons: ['Silent data loss: dropped financial or order events cannot be easily recovered'],
      },
    ],
    chosenOption: 'Retry Topic Hierarchy with Dead-Letter Queue (DLQ)',
    rationale: 'Extends ADR-0019. Bounded retries with dead-letter isolation protect partition throughput while guaranteeing zero data loss for malformed or problematic events.',
    positiveConsequences: [
      'Poison pill messages no longer cause cascading consumer crash loops.',
      'SRE teams have automated alerts monitoring DLQ depth with replay tooling to re-inject remediated messages.',
      'Failed payloads retain original trace IDs and error stack traces in message headers.',
    ],
    negativeConsequences: [
      'Messages routed to retry queues lose strict FIFO ordering relative to non-retried messages on the same key.',
      'Requires consumer frameworks to standardize DLQ header formats and error routing wrappers.',
    ],
    links: [
      { text: 'ADR-0009: Centralized Structured JSON Logging Standards', url: '0009-centralized-structured-json-logging.md', category: 'internal' },
      { text: 'ADR-0019: Asynchronous Event Streaming Architecture via Apache Kafka', url: '0019-event-driven-streaming-architecture-kafka.md', category: 'internal' },
      { text: 'Uber Engineering: Reliable Reprocessing with Kafka Retry Queues', url: 'https://www.uber.com/blog/reliable-reprocessing/', category: 'canonical' },
    ],
  },
  {
    id: '0024',
    slug: 'idempotent-api-request-handling',
    title: 'Idempotent API Request Processing with Distributed Locks',
    status: 'accepted',
    deciders: ['API Governance Guild', 'Financial Systems WG'],
    date: '2024-11-20',
    story: 'PLAT-270',
    category: 'API Design',
    extends: ['0010'],
    dependsOn: ['0005'],
    context: 'Unreliable mobile networks and automatic API gateway retry policies frequently caused duplicate POST requests to be submitted for order placements and wallet fund deductions. Without deterministic idempotency guarantees, users were accidentally charged twice or duplicate inventory reservations were created.',
    drivers: [
      'Guarantee exactly-once side-effect execution for mutating HTTP POST requests',
      'Standardized client Idempotency-Key header semantics across all API endpoints',
      'Protection against concurrent race conditions during in-flight duplicate submissions',
    ],
    options: [
      {
        name: 'Redis-Backed Distributed Idempotency Key Gate with Atomic Locks',
        description: 'Clients provide an Idempotency-Key UUID header. Middleware attempts an atomic Redis SET NX with a 120-second lease. If acquired, execution proceeds and caches the final HTTP response status and body in Redis for 24 hours. If locked, concurrent requests receive HTTP 409 or poll. If cached, the original response is replayed immediately.',
        pros: ['Guarantees identical responses for duplicate requests without repeating business logic', 'Eliminates double charges and duplicate order creations', 'Seamless integration via standardized gateway/application middleware'],
        cons: ['Requires Redis cluster write on every mutating request', 'Clients must generate stable UUID keys per user action'],
      },
      {
        name: 'Database Unique Constraint Matching',
        description: 'Rely solely on unique database indexes (e.g., unique customer_id + order_token).',
        pros: ['Leverages existing database transaction guarantees without Redis'],
        cons: ['Throws generic database integrity errors instead of replaying valid business responses', 'Does not protect expensive upstream validation and payment gateway calls'],
      },
    ],
    chosenOption: 'Redis-Backed Distributed Idempotency Key Gate with Atomic Locks',
    rationale: 'Extends ADR-0010 and depends on ADR-0005. The IETF draft standard for Idempotency-Key provides a deterministic contract that shields downstream payment gateways from duplicate executions.',
    positiveConsequences: [
      'Completely eradicated duplicate billing and double-booking incidents across checkout flows.',
      'Safely allows mobile clients and gateways to retry aggressive network timeouts without fear of side effects.',
      'Standardized HTTP response replay adheres to IETF API specifications.',
    ],
    negativeConsequences: [
      'Clients must handle HTTP 409 Conflict if they resubmit requests while the initial execution is still in-flight.',
      'Increases storage requirements for response payload caching in Redis.',
    ],
    links: [
      { text: 'ADR-0005: Stateless Service Architecture and Session Externalization', url: '0005-stateless-service-session-externalization.md', category: 'internal' },
      { text: 'ADR-0010: HTTP REST with OpenAPI Specification Contracts', url: '0010-http-rest-openapi-contracts.md', category: 'internal' },
      { text: 'IETF Draft: The Idempotency-Key HTTP Header Field', url: 'https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/', category: 'canonical' },
    ],
  },
  {
    id: '0025',
    slug: 'opentelemetry-distributed-tracing-standards',
    title: 'Distributed Tracing and OpenTelemetry Semantic Conventions',
    status: 'accepted',
    deciders: ['Observability Guild', 'Site Reliability Engineering'],
    date: '2024-12-04',
    story: 'PLAT-278',
    category: 'Observability',
    extends: ['0009'],
    dependsOn: ['0007'],
    context: 'As the platform grew to over 40 interconnected microservices, diagnosing latency bottlenecks, inter-service timeouts, and cascading failure cascades was virtually impossible using isolated logs alone. Engineers lacked end-to-end visibility into the distributed call graphs traversed by single user transactions.',
    drivers: [
      'Vendor-agnostic distributed telemetry instrumentation across polyglot services',
      'Automated context propagation over HTTP, gRPC, and Kafka using W3C TraceContext standards',
      'Deterministic semantic conventions for database queries, external API calls, and errors',
    ],
    options: [
      {
        name: 'OpenTelemetry SDK Integration with Central OTel Collector Tier',
        description: 'Instrument services with OpenTelemetry SDKs, propagating traceparent headers across HTTP/gRPC/Kafka boundaries. Traces are exported via OTLP gRPC to an autoscaled OpenTelemetry Collector pool that routes spans to Jaeger/Tempo storage.',
        pros: ['Zero vendor lock-in; standardized open industry specification', 'Unified correlation connecting traces, structured logs (ADR-0009), and metrics', 'Tail-based sampling at the collector tier discards uninteresting 200 OK spans while retaining 100% of errors'],
        cons: ['Tracing overhead adds 0.5-1ms CPU and network payload latency', 'High telemetry storage volumes requiring strict retention policies'],
      },
      {
        name: 'Proprietary Commercial APM Agent Injection',
        description: 'Inject closed-source commercial agents at container runtime.',
        pros: ['Automated bytecode instrumentation requiring minimal code edits'],
        cons: ['Severe vendor lock-in and exorbitant licensing costs that scale with transaction volume', 'Opaque agent performance overhead and security review friction'],
      },
    ],
    chosenOption: 'OpenTelemetry SDK Integration with Central OTel Collector Tier',
    rationale: 'Extends ADR-0009 and depends on ADR-0007. OpenTelemetry is the canonical open standard for distributed systems observability. In-process SDKs combined with tail-sampling collector tiers provide deep architectural visibility without proprietary vendor capture.',
    positiveConsequences: [
      'MTTR for cross-service latency regressions decreased by 65%.',
      'Engineers can inspect complete call graphs including database queries and Kafka lag directly in trace UIs.',
      'Log records now embed valid trace_id and span_id fields, enabling seamless jump-from-log-to-trace workflows.',
    ],
    negativeConsequences: [
      'Platform team must operate an autoscaled OTel Collector tier and underlying trace storage.',
      'All internal RPC and message producers must strictly forward W3C TraceContext headers.',
    ],
    links: [
      { text: 'ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy', url: '0007-service-mesh-mtls-and-traffic-policy.md', category: 'internal' },
      { text: 'ADR-0009: Centralized Structured JSON Logging Standards', url: '0009-centralized-structured-json-logging.md', category: 'internal' },
      { text: 'W3C Trace Context Specification', url: 'https://www.w3.org/TR/trace-context/', category: 'canonical' },
    ],
  },
  {
    id: '0026',
    slug: 'modular-infrastructure-as-code-opentofu',
    title: 'Modular Infrastructure as Code with OpenTofu',
    status: 'accepted',
    deciders: ['Cloud Infrastructure Team', 'Platform Architecture WG'],
    date: '2024-12-18',
    story: 'PLAT-285',
    category: 'Infrastructure as Code',
    requiredBy: ['0027'],
    context: 'Cloud resources (virtual networks, managed databases, IAM policies, DNS records) were historically provisioned through ad-hoc cloud console clicks or isolated bash scripts. This led to undocumented configuration drift, untracked security group modifications, and made provisioning identical staging environments impossible.',
    drivers: [
      '100% declarative, auditable infrastructure versioned in git repositories',
      'Modular, reusable blueprints enforcing enterprise networking and security standards',
      'Automated continuous drift detection and state locking across team workflows',
    ],
    options: [
      {
        name: 'Modular OpenTofu with Remote State Storage and Locking',
        description: 'Define all cloud infrastructure in OpenTofu modules stored in git. Remote state files are maintained in encrypted cloud storage with distributed DynamoDB/GCS locking. CI pipelines execute automated plan generation on PRs and apply upon merge.',
        pros: ['Completely open-source, MPL-2.0 licensed community tooling', 'Verifiable pull-request plans before applying changes to production', 'Enables deterministic multi-region environment instantiation'],
        cons: ['State file corruption risks if manual modifications occur out-of-band', 'Requires strict state management discipline and sensitive variable handling'],
      },
      {
        name: 'Cloud-Specific Templating (AWS CloudFormation / Azure Bicep)',
        description: 'Use native cloud provider declarative templates.',
        pros: ['Native cloud support without external state storage'],
        cons: ['Locks the platform into a single cloud provider syntax', 'Inconsistent modularity and testing frameworks across multi-cloud integrations'],
      },
    ],
    chosenOption: 'Modular OpenTofu with Remote State Storage and Locking',
    rationale: 'Required by ADR-0027. OpenTofu provides open-source, vendor-neutral declarative infrastructure automation with robust module composability and cryptographic state locking.',
    positiveConsequences: [
      'Every cloud resource change is peer-reviewed in git pull requests with automated plan outputs.',
      'New staging and testing environments can be spun up from zero in under 30 minutes.',
      'Nightly drift detection pipelines catch and flag any manual console alterations.',
    ],
    negativeConsequences: [
      'Engineers must learn OpenTofu HCL and module composition paradigms.',
      'Secrets cannot be stored in plaintext within state files; requires integration with Vault (ADR-0017).',
    ],
    links: [
      { text: 'ADR-0011: Workload Identity Federation for Cloud Resources', url: '0011-workload-identity-federation.md', category: 'internal' },
      { text: 'ADR-0027: Dual-Region Warm-Standby Disaster Recovery Topology', url: '0027-dual-region-disaster-recovery-topology.md', category: 'internal' },
      { text: 'OpenTofu Project Documentation', url: 'https://opentofu.org/docs/', category: 'canonical' },
    ],
  },
  {
    id: '0028',
    slug: 'edge-caching-and-global-cdn-delivery',
    title: 'Edge Caching and Global Content Delivery Network',
    status: 'accepted',
    deciders: ['Edge Architecture WG', 'Web Performance Guild'],
    date: '2025-01-08',
    story: 'PLAT-292',
    category: 'Edge and Performance',
    extends: ['0014'],
    context: 'International users experienced high latency (exceeding 800ms) when fetching static web bundles, media assets, and localized pricing matrices directly from single-region origin clusters. Origin web gateways suffered heavy bandwidth egress costs serving repetitive static assets.',
    drivers: [
      'Deliver static assets and cacheable API payloads with sub-50ms latency globally',
      'Offload repetitive GET requests from origin ingress gateways',
      'Automated tag-based cache purging (Surrogate-Keys) during continuous deployments',
    ],
    options: [
      {
        name: 'Cloudflare Global CDN with Cache-Tag Invalidation',
        description: 'Route public DNS through Cloudflare edge anycast networks, caching immutable static assets (versioned with content hashes) for one year and dynamic API responses with explicit Cache-Control and Surrogate-Key headers invalidated via webhooks.',
        pros: ['Over 300 global edge points of presence bringing content close to end users', 'Reduces origin bandwidth egress costs by over 70%', 'Built-in DDoS mitigation and edge TLS termination'],
        cons: ['Third-party dependency on edge network availability', 'Risk of users seeing stale content if cache purge signals fail'],
      },
      {
        name: 'Direct Origin Ingress Serving with In-Cluster Nginx Caching',
        description: 'Serve all static and dynamic traffic directly from origin Kubernetes clusters.',
        pros: ['Immediate cache invalidation control within local clusters'],
        cons: ['Severe latency penalties for international users across oceans', 'Massive cloud egress bandwidth billing costs'],
      },
    ],
    chosenOption: 'Cloudflare Global CDN with Cache-Tag Invalidation',
    rationale: 'Extends ADR-0014. Edge caching dramatically flattens global latency curves and insulates origin infrastructure from massive volumetric traffic spikes.',
    positiveConsequences: [
      'Global median P95 page load time decreased from 780ms to 120ms.',
      'Origin cluster network egress bandwidth costs decreased by 68%.',
      'Automated CI deployment hooks purge relevant Cache-Tags atomically during releases.',
    ],
    negativeConsequences: [
      'Developers must strictly set Cache-Control headers (private vs public, s-maxage) on all HTTP responses.',
      'Testing edge routing rules requires staging environments with custom CDN host headers.',
    ],
    links: [
      { text: 'ADR-0014: Edge API Gateway Rate Limiting and WAF Policy', url: '0014-rate-limiting-and-api-gateway-enforcement.md', category: 'internal' },
      { text: 'ADR-0021: Distributed Read-Through Query Caching via Redis', url: '0021-read-heavy-query-caching-redis.md', category: 'internal' },
      { text: 'RFC 9211: The Cache-Status HTTP Response Header Field', url: 'https://datatracker.ietf.org/doc/html/rfc9211', category: 'canonical' },
    ],
  },
  {
    id: '0027',
    slug: 'dual-region-disaster-recovery-topology',
    title: 'Dual-Region Warm-Standby Disaster Recovery Topology',
    status: 'accepted',
    deciders: ['Platform Architecture WG', 'Executive Risk Committee', 'SRE Lead'],
    date: '2025-01-22',
    story: 'PLAT-300',
    category: 'Reliability and Disaster Recovery',
    dependsOn: ['0015', '0022', '0026'],
    context: 'A localized primary cloud datacenter power failure caused a four-hour platform outage. Executive risk governance mandated an auditable Disaster Recovery (DR) posture capable of fulfilling a Recovery Time Objective (RTO) of under 15 minutes and a Recovery Point Objective (RPO) of under 5 minutes without catastrophic data loss.',
    drivers: [
      'Guaranteed business continuity during regional cloud outages',
      'RTO < 15 minutes and RPO < 5 minutes for tier-1 transactional services',
      'Cost-conscious infrastructure footprint avoiding duplicate 100% idle active-active compute pools',
    ],
    options: [
      {
        name: 'Warm-Standby Dual-Region Topology with Cross-Region Storage Replication',
        description: 'Operate primary compute in Region A. Maintain a secondary Region B with minimum baseline infrastructure (10% compute capacity, replicated storage, automated GitOps deployment sync, and cross-region asynchronous database read replicas). During failover, promote database replica to primary and autoscale compute.',
        pros: ['Fulfills RTO < 15min and RPO < 5min targets reliably', 'Limits disaster recovery infrastructure costs to approximately 30% above single-region footprint', 'GitOps (ADR-0015) guarantees secondary region configuration matches primary identically'],
        cons: ['Asynchronous replication window means up to 1-2 minutes of recent transactions may require reconciliation', 'Requires scheduled quarterly disaster recovery failover drill tests'],
      },
      {
        name: 'Active-Active Multi-Region Multi-Master Topology',
        description: 'Run 50/50 traffic split simultaneously across both regions with distributed multi-master databases (e.g., CockroachDB / Spanner).',
        pros: ['Near-zero RTO failover by switching DNS weights'],
        cons: ['Massive operational complexity managing multi-master database conflict resolution', 'High cross-region latency overhead on every transactional write'],
      },
    ],
    chosenOption: 'Warm-Standby Dual-Region Topology with Cross-Region Storage Replication',
    rationale: 'Depends on ADR-0015, ADR-0022, and ADR-0026. Warm standby delivers the optimal balance of verifiable recovery time, operational simplicity, and financial feasibility without the hairiness of active-active distributed write conflicts.',
    positiveConsequences: [
      'Established verifiable compliance with enterprise 15-minute RTO / 5-minute RPO business mandates.',
      'GitOps pipelines automatically deploy identical application releases to both regions simultaneously.',
      'Quarterly automated DR drills validate failover playbooks in production-like environments.',
    ],
    negativeConsequences: [
      'DNS failover propagation introduces a 2-5 minute client-side TTL delay.',
      'Data engineering teams must maintain playbooks for reconciling asynchronous replication gap records post-failover.',
    ],
    diagram: `graph TD
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
    DbA -->|Async Replication (RPO < 2m)| DbB`,
    links: [
      { text: 'ADR-0015: Declarative GitOps Continuous Delivery Architecture', url: '0015-declarative-gitops-continuous-delivery.md', category: 'internal' },
      { text: 'ADR-0022: Expand-Contract Schema Evolution for Zero Downtime', url: '0022-expand-contract-database-migrations.md', category: 'internal' },
      { text: 'ADR-0026: Modular Infrastructure as Code with OpenTofu', url: '0026-modular-infrastructure-as-code-opentofu.md', category: 'internal' },
      { text: 'AWS / Cloud Disaster Recovery Architectures', url: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html', category: 'canonical' },
    ],
  },
  {
    id: '0029',
    slug: 'admission-control-policy-as-code',
    title: 'Admission Control Policy-as-Code with Gatekeeper',
    status: 'accepted',
    deciders: ['Security Architecture WG', 'Platform Governance Guild'],
    date: '2025-02-05',
    story: 'PLAT-310',
    category: 'Governance and Security',
    dependsOn: ['0016'],
    context: 'Despite publishing container security guidelines and resource quota best practices, engineering teams occasionally deployed pods with root user privileges, missing CPU/RAM limits, untrusted public container registries, or privileged Linux capabilities that jeopardized cluster stability and compliance.',
    drivers: [
      'Automated, preventive enforcement of security and resource guardrails before workloads deploy',
      'Policy-as-Code definitions versioned and tested in git repositories',
      'Shift-left policy validation in local developer workflows and CI pull requests',
    ],
    options: [
      {
        name: 'Gatekeeper Open Policy Agent (OPA) Admission Webhooks',
        description: 'Deploy Gatekeeper validating admission webhooks in clusters. Policies written in Rego enforce rules: reject images not from enterprise registries, reject root UIDs, mandate memory limits, and require standard ownership labels.',
        pros: ['Prevents non-compliant manifests from ever entering the cluster control plane', 'Standardized Rego policy language with rich unit testing frameworks', 'Supports dry-run audit mode before switching to active rejection'],
        cons: ['Webhook failures can block cluster operations if not configured with failurePolicy: Ignore', 'Requires developers to understand admission rejection error messages'],
      },
      {
        name: 'Post-Deployment Security Scanners (Async Polling)',
        description: 'Scan running cluster resources every hour and file Jira tickets for compliance violations.',
        pros: ['Zero risk of blocking legitimate deployments'],
        cons: ['Reactive posture: vulnerable or privileged pods run for hours before detection', 'Creates massive ticket backlog toil for security teams'],
      },
    ],
    chosenOption: 'Gatekeeper Open Policy Agent (OPA) Admission Webhooks',
    rationale: 'Depends on ADR-0016. Preventative admission control ensures compliance policies are enforced deterministically at the front door rather than remediated reactively post-incident.',
    positiveConsequences: [
      '100% of running production workloads adhere strictly to non-root UID execution (ADR-0016).',
      'Cluster resource starvation eliminated by mandating memory and CPU limits on every pod.',
      'Developers receive instant, actionable feedback in CI if deployment manifests violate policies.',
    ],
    negativeConsequences: [
      'Platform team must thoroughly test admission policies in staging to prevent breaking emergency deployments.',
      'Rego policy syntax requires specialized training for security engineers.',
    ],
    links: [
      { text: 'ADR-0015: Declarative GitOps Continuous Delivery Architecture', url: '0015-declarative-gitops-continuous-delivery.md', category: 'internal' },
      { text: 'ADR-0016: Minimal Container Base Images and Build Security', url: '0016-minimal-container-base-images-and-build-security.md', category: 'internal' },
      { text: 'Open Policy Agent Gatekeeper Documentation', url: 'https://open-policy-agent.github.io/gatekeeper/website/', category: 'canonical' },
    ],
  },
  {
    id: '0030',
    slug: 'ephemeral-pull-request-preview-environments',
    title: 'Ephemeral Pull Request Preview Environments',
    status: 'proposed',
    deciders: ['Developer Experience Guild', 'Platform Architecture WG'],
    date: '2025-02-19',
    story: 'PLAT-320',
    category: 'Developer Experience',
    dependsOn: ['0015'],
    context: 'Development teams face significant bottlenecks waiting for shared staging environments to verify complex cross-service features, API contracts, and frontend user experiences. Code conflicts, dirty test data, and competing release trains in staging delay pull request reviews and degrade developer inner-loop velocity.',
    drivers: [
      'On-demand, isolated preview environments dynamically provisioned per pull request',
      'Automatic teardown and resource reclamation upon pull request merge or closure',
      'Cost-conscious ephemeral resource footprint using lightweight namespace isolation',
    ],
    options: [
      {
        name: 'Ephemeral Kubernetes Namespaces via ArgoCD ApplicationSets',
        description: 'When a PR is opened, an automated pipeline creates an ephemeral namespace (e.g., pr-124), deploys the branch container image, provisions mock backing services, and routes preview traffic via dedicated subdomains (pr-124.preview.internal).',
        pros: ['Zero staging environment contention; engineers test features in complete isolation', 'Rapid stakeholder verification with dedicated preview URLs', 'Automated cleanup deletes namespaces after 24 hours of inactivity or on PR merge'],
        cons: ['Increased cluster resource utilization from concurrent preview environments', 'Requires sophisticated mocking or sanitized shared baseline databases for backend dependencies'],
      },
      {
        name: 'Dedicated Permanent Staging Environments per Team',
        description: 'Maintain persistent staging clusters for each individual engineering team.',
        pros: ['Static endpoints that never change'],
        cons: ['Extremely expensive idle infrastructure compute footprint', 'Still suffers from within-team staging lockouts and data contamination'],
      },
    ],
    chosenOption: 'Ephemeral Kubernetes Namespaces via ArgoCD ApplicationSets',
    rationale: 'Depends on ADR-0015. Dynamic ephemeral namespaces maximize developer autonomy and testing velocity while ensuring idle compute resources are reclaimed automatically without human intervention.',
    positiveConsequences: [
      'Developers and product owners can verify feature branches in live preview URLs before merge.',
      'Eliminated scheduling contention and deployment collisions in shared staging environments.',
      'Automated TTL controllers prevent runaway cloud infrastructure expenditure.',
    ],
    negativeConsequences: [
      'Cluster autoscalers must accommodate dynamic capacity spikes when multiple PRs are active.',
      'Services with heavy data dependencies must utilize lightweight mock seeds in preview namespaces.',
    ],
    links: [
      { text: 'ADR-0012: Hierarchical Dynamic Configuration Management', url: '0012-hierarchical-dynamic-configuration-management.md', category: 'internal' },
      { text: 'ADR-0015: Declarative GitOps Continuous Delivery Architecture', url: '0015-declarative-gitops-continuous-delivery.md', category: 'internal' },
      { text: 'ADR-0026: Modular Infrastructure as Code with OpenTofu', url: '0026-modular-infrastructure-as-code-opentofu.md', category: 'internal' },
      { text: 'ArgoCD ApplicationSet Controller: Pull Request Generator', url: 'https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Pull-Request/', category: 'canonical' },
    ],
  },
];
