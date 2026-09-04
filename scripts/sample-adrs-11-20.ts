import type { AdrDef } from './sample-adrs-1-10.js';

export const ADRS_11_TO_20: AdrDef[] = [
  {
    id: '0011',
    slug: 'workload-identity-federation',
    title: 'Workload Identity Federation for Cloud Resources',
    status: 'accepted',
    deciders: ['Security Architecture WG', 'Cloud Infrastructure Team'],
    date: '2024-05-22',
    story: 'PLAT-172',
    category: 'Identity and Access Management',
    requiredBy: ['0007', '0017'],
    context: 'Services running in container clusters previously authenticated to cloud resources using static service account keys or permanent API tokens stored in configuration files. Security audits identified that static keys had leaked into git histories or remained unrotated for months, presenting unacceptable exfiltration risks.',
    drivers: [
      'Complete elimination of long-lived, static cloud credentials',
      'Automated, cryptographically verifiable credential lifecycle using OpenID Connect (OIDC)',
      'Strict least-privilege role binding mapped to individual workload service accounts',
    ],
    options: [
      {
        name: 'Workload Identity Federation via Service Account OIDC Tokens',
        description: 'Federate pod service accounts directly with Cloud IAM using projected OIDC tokens exchanged dynamically for short-lived cloud credentials.',
        pros: ['Zero long-lived secret keys stored in clusters or environment variables', 'Credentials automatically expire within one hour', 'Direct auditability linking cloud API calls to specific workload namespaces'],
        cons: ['Requires strict cloud IAM trust policy configuration per service', 'Unavailable on legacy clusters without OIDC provider endpoints'],
      },
      {
        name: 'Manual Service Account Key Rotation Cron Jobs',
        description: 'Store static keys in cluster secrets and rotate them periodically via automated scripts.',
        pros: ['Works with legacy services without code changes'],
        cons: ['Still vulnerable to token exfiltration during the active window', 'Complex failure modes when rotation jobs fail silently'],
      },
    ],
    chosenOption: 'Workload Identity Federation via Service Account OIDC Tokens',
    rationale: 'Eliminating static credentials is a foundational pillar of zero-trust cloud infrastructure. Projected OIDC tokens guarantee that compromised container filesystems yield no reusable static credentials.',
    positiveConsequences: [
      'Static cloud credential files were completely eradicated from all application repositories.',
      'Security audit compliance achieved 100% adherence for least-privilege cloud access.',
      'Credential rotation happens automatically without human intervention or application restarts.',
    ],
    negativeConsequences: [
      'Developers running workloads locally must use personal cloud authentication proxies.',
      'Misconfigured IAM trust policies cause immediate permission denied errors requiring specialized IAM triage.',
    ],
    links: [
      { text: 'ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy', url: '0007-service-mesh-mtls-and-traffic-policy.md', category: 'internal' },
      { text: 'ADR-0017: Ephemeral Secrets Management via Dynamic Vault Leases', url: '0017-ephemeral-secrets-management-vault.md', category: 'internal' },
      { text: 'Kubernetes Workload Identity Federation Guide', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/', category: 'canonical' },
    ],
  },
  {
    id: '0012',
    slug: 'hierarchical-dynamic-configuration-management',
    title: 'Hierarchical Dynamic Configuration Management',
    status: 'accepted',
    deciders: ['Platform Architecture WG', 'Core Systems Team'],
    date: '2024-06-05',
    story: 'PLAT-180',
    category: 'Configuration Management',
    supersedes: ['0001'],
    dependsOn: ['0015'],
    context: 'As determined in retrospective analysis of ADR-0001, static configuration files baked into images created intolerable deployment friction and drift. Applications required hierarchical configuration merging (global defaults, regional overrides, environment-specific overrides) capable of dynamic runtime reload for feature flags, operational circuit breakers, and rate limit thresholds without restarting pods.',
    drivers: [
      'Centralized, auditable configuration repository backed by GitOps workflows',
      'Hierarchical inheritance allowing safe global baseline defaults with targeted overrides',
      'Dynamic runtime parameter updates without restarting application pods',
    ],
    options: [
      {
        name: 'Hierarchical External Config with GitOps Sync (External Secrets & ConfigMaps)',
        description: 'Maintain structured YAML configurations in a centralized git repository, syncing them into cluster ConfigMaps and injecting them via volume mounts with in-process file watch notifications.',
        pros: ['Git commit audit log for every parameter change', 'Zero rebuilds required to adjust operational thresholds', 'Automated hot-reloading for applications supporting file watcher hooks'],
        cons: ['Applications must be architected to handle asynchronous configuration reloads safely', 'Risk of malformed configuration syntax causing runtime crashes if not validated by schema CI'],
      },
      {
        name: 'Distributed Key-Value Service (Consul / Etcd)',
        description: 'Query central KV store over HTTP/gRPC at runtime.',
        pros: ['Instant sub-second propagation across all instances'],
        cons: ['Introduces runtime hard dependency on KV store availability during network partitions', 'Complex distributed watch connection maintenance'],
      },
    ],
    chosenOption: 'Hierarchical External Config with GitOps Sync (External Secrets & ConfigMaps)',
    rationale: 'Supersedes ADR-0001. Git-driven configuration guarantees auditability and peer review, while volume projections ensure applications run resiliently from local filesystem buffers even during control plane blips.',
    positiveConsequences: [
      'Configuration changes are deployed independently of application container builds.',
      'Every production parameter modification has a traceable git commit author and review approval.',
      'Feature flags and traffic limits can be updated dynamically in seconds.',
    ],
    negativeConsequences: [
      'Application configuration parsing logic must support atomic hot-reloading without race conditions.',
      'Requires strict JSON Schema validation in the configuration git repository to prevent invalid data.',
    ],
    links: [
      { text: 'ADR-0001: Static File Runtime Configuration', url: '0001-static-file-runtime-configuration.md', category: 'internal' },
      { text: 'ADR-0015: Declarative GitOps Continuous Delivery Architecture', url: '0015-declarative-gitops-continuous-delivery.md', category: 'internal' },
      { text: 'Kubernetes ConfigMap Best Practices', url: 'https://kubernetes.io/docs/concepts/configuration/configmap/', category: 'canonical' },
    ],
  },
  {
    id: '0013',
    slug: 'progressive-delivery-and-canary-rollouts',
    title: 'Progressive Delivery and Canary Traffic Splitting',
    status: 'accepted',
    deciders: ['Release Engineering Guild', 'Site Reliability Engineering', 'Platform Architecture WG'],
    date: '2024-06-19',
    story: 'PLAT-188',
    category: 'Deployment Infrastructure',
    extends: ['0007'],
    dependsOn: ['0015'],
    context: 'Standard rolling deployments replaced healthy instances with newly deployed versions in batches. If a subtle bug, memory leak, or performance regression slipped through CI, 100% of production users were exposed to errors before alerts could trigger human rollback intervention, degrading system availability metrics.',
    drivers: [
      'Restrict blast radius of unverified releases to a small percentage of real production traffic',
      'Automated analysis of golden signals (HTTP 5xx errors, P99 latency, host restarts)',
      'Autonomous rollback without human intervention when statistical failure thresholds are exceeded',
    ],
    options: [
      {
        name: 'Automated Canary Progressive Delivery (Flagger + Envoy Service Mesh)',
        description: 'Deploy new versions alongside production baselines, shifting traffic incrementally (5% -> 10% -> 25% -> 50% -> 100%) while continuously querying Prometheus metrics for anomalies.',
        pros: ['Minimizes user blast radius to less than 5% during bad deployments', 'Zero human intervention required to abort and rollback faulty releases', 'Statistically rigorous validation under true production traffic patterns'],
        cons: ['Requires dual deployment capacity during active canary evaluation windows', 'Increases release duration from 2 minutes to 15-20 minutes'],
      },
      {
        name: 'Blue/Green Environment Switching',
        description: 'Maintain identical staging environment and switch 100% router traffic at once.',
        pros: ['Instant rollback by switching router back to blue environment'],
        cons: ['100% of users are exposed simultaneously upon switch', 'Doubles continuous idle infrastructure compute costs'],
      },
    ],
    chosenOption: 'Automated Canary Progressive Delivery (Flagger + Envoy Service Mesh)',
    rationale: 'Extends ADR-0007. Utilizing Envoy service mesh traffic routing rules orchestrated by Flagger enables automated, metric-gated rollouts with negligible human toil and verifiable blast radius containment.',
    positiveConsequences: [
      'Customer-impacting outages from deployment regressions dropped by over 80%.',
      'Engineers gain confidence deploying changes directly during daylight business hours.',
      'SRE teams are relieved from manual deployment monitoring duties.',
    ],
    negativeConsequences: [
      'Services must maintain forward and backward schema compatibility during the canary window.',
      'Canary evaluation requires meaningful production traffic volume to achieve statistical significance.',
    ],
    diagram: `graph LR
    User[Client Ingress] --> Mesh[Envoy Traffic Router]
    Mesh -->|95% Stable Traffic| Primary[App Version v1.4.0 (Primary)]
    Mesh -->|5% Canary Probe| Canary[App Version v1.5.0 (Canary)]
    Canary --> Metrics[Prometheus Metric Collector]
    Metrics -->|Error Rate < 0.1%| Controller[Flagger Canary Controller]
    Controller -->|Promote Step| Mesh`,
    links: [
      { text: 'ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy', url: '0007-service-mesh-mtls-and-traffic-policy.md', category: 'internal' },
      { text: 'ADR-0015: Declarative GitOps Continuous Delivery Architecture', url: '0015-declarative-gitops-continuous-delivery.md', category: 'internal' },
      { text: 'Flagger Progressive Delivery Documentation', url: 'https://flagger.app', category: 'canonical' },
    ],
  },
  {
    id: '0014',
    slug: 'rate-limiting-and-api-gateway-enforcement',
    title: 'Edge API Gateway Rate Limiting and WAF Policy',
    status: 'accepted',
    deciders: ['Security Architecture WG', 'Platform Operations'],
    date: '2024-07-03',
    story: 'PLAT-195',
    category: 'Edge and Security',
    extends: ['0010'],
    requiredBy: ['0028'],
    context: 'Public-facing REST endpoints were subjected to credential stuffing attacks, aggressive scraping bots, and unintentional rogue API client infinite loops that overwhelmed backend database connection pools and degraded availability for legitimate users.',
    drivers: [
      'Protect backend services from denial-of-service and brute-force traffic spikes',
      'Enforce fair-use quotas and rate limits tiered by client tier (anonymous, authenticated, partner)',
      'Terminate TLS and inspect malicious payloads at the network perimeter',
    ],
    options: [
      {
        name: 'Distributed Token-Bucket Rate Limiting at Edge API Gateway (Kong / Envoy)',
        description: 'Enforce rate limits at the perimeter gateway using a shared Redis cluster to track client token buckets based on IP, API key, or JWT client ID.',
        pros: ['Rejects malicious traffic before it consumes internal cluster network and compute resources', 'Consistent HTTP 429 Too Many Requests response headers across all APIs', 'Configurable sliding window and burst quotas per route'],
        cons: ['Requires low-latency edge Redis cluster', 'Misconfigured limits can accidentally throttle legitimate bursts'],
      },
      {
        name: 'In-process rate limiting middleware inside application code',
        description: 'Implement token bucket filters within application middleware.',
        pros: ['Fine-grained access to internal domain models for rate calculation'],
        cons: ['Backend pods still spend CPU/memory accepting and parsing abusive requests', 'State synchronization across autoscaled pods is inaccurate or slow'],
      },
    ],
    chosenOption: 'Distributed Token-Bucket Rate Limiting at Edge API Gateway (Kong / Envoy)',
    rationale: 'Extends ADR-0010. Perimeter rate limiting halts abusive traffic at the network edge, preserving internal cluster capacity and ensuring uniform policy enforcement across all microservices.',
    positiveConsequences: [
      'Shielded backend databases from connection exhaustion during bot attacks.',
      'Standardized RateLimit-* response headers improve partner client integration transparency.',
      'Decreased cloud compute egress costs by dropping unauthorized traffic at the border.',
    ],
    negativeConsequences: [
      'The edge gateway and its backing Redis tier become critical paths requiring active multi-zone redundancy.',
      'API contract tests must verify client behavior under 429 response conditions.',
    ],
    links: [
      { text: 'ADR-0010: HTTP REST with OpenAPI Specification Contracts', url: '0010-http-rest-openapi-contracts.md', category: 'internal' },
      { text: 'ADR-0028: Edge Caching and Global Content Delivery Network', url: '0028-edge-caching-and-global-cdn-delivery.md', category: 'internal' },
      { text: 'IETF RFC 6585: Additional HTTP Status Codes (429)', url: 'https://datatracker.ietf.org/doc/html/rfc6585', category: 'canonical' },
    ],
  },
  {
    id: '0015',
    slug: 'declarative-gitops-continuous-delivery',
    title: 'Declarative GitOps Continuous Delivery Architecture',
    status: 'accepted',
    deciders: ['Platform Architecture WG', 'Release Engineering Guild', 'Security Team'],
    date: '2024-07-17',
    story: 'PLAT-202',
    category: 'Deployment Infrastructure',
    supersedes: ['0003'],
    dependsOn: ['0004'],
    requiredBy: ['0012', '0013', '0027', '0030'],
    context: 'Traditional imperative CI/CD pipelines pushed deployments directly to clusters by running deployment scripts using high-privilege cluster admin credentials embedded in CI runners. This approach lacked reconciliation against out-of-band manual changes, exposed cluster credentials to CI runner vulnerabilities, and made catastrophic cluster recovery complex and error-prone.',
    drivers: [
      'Git as the single, auditable source of truth for desired infrastructure and application state',
      'Pull-based reconciliation model eliminating external cluster administrative credentials in CI',
      'Continuous drift detection and automated remediation against manual cluster changes',
    ],
    options: [
      {
        name: 'Pull-Based GitOps Continuous Delivery (ArgoCD / Flux)',
        description: 'An in-cluster controller monitors a declarative git repository containing Helm manifests, continuously reconciling live cluster state against the git repository.',
        pros: ['CI runners require zero cluster credentials; they only commit to git', 'Every production deployment is an auditable git commit with author and review signoff', 'Disaster recovery cluster re-hydration is achieved simply by pointing ArgoCD to the repo'],
        cons: ['Slight synchronization delay (1-2 minutes) unless git webhook triggers are configured', 'Learning curve for developers used to imperative CLI deployments'],
      },
      {
        name: 'Push-Based CI Deployments (CI Runner Direct Push)',
        description: 'CI runners execute deployment scripts over cluster API endpoints.',
        pros: ['Direct step-by-step pipeline execution visibility'],
        cons: ['Security risk: cluster credentials distributed across multiple CI runners', 'Cannot detect or heal manual drift introduced during live emergency debugging'],
      },
    ],
    chosenOption: 'Pull-Based GitOps Continuous Delivery (ArgoCD / Flux)',
    rationale: 'Supersedes ADR-0003 and depends on ADR-0004. GitOps establishes an airtight, cryptographically signed audit trail where git history is the exact mirror of live cluster topology, while isolating cluster control planes from CI execution environments.',
    positiveConsequences: [
      'Completely eliminated write credentials to clusters from external CI workers.',
      'Drift detection immediately alerts or reverts unauthorized manual cluster edits.',
      'Entire cluster workloads can be recovered in a new cloud region in under 15 minutes by applying the root GitOps manifest.',
    ],
    negativeConsequences: [
      'Developers cannot perform quick manual hotfixes in staging or production; all edits must traverse git pull requests.',
      'Repository structure requires disciplined separation between application code repos and environment config repos.',
    ],
    diagram: `graph LR
    Dev[Developer PR] -->|Merge| GitRepo[Config Git Repository]
    GitRepo -->|Webhook / Polling| Argo[ArgoCD In-Cluster Controller]
    Argo -->|Compare Desired vs Live| Diff{State Drift?}
    Diff -->|Yes| Heal[Reconcile Live Cluster Resources]
    Diff -->|No| Sync[Cluster In Sync]`,
    links: [
      { text: 'ADR-0003: Direct Host Process Execution on Persistent Instances', url: '0003-direct-host-process-execution.md', category: 'internal' },
      { text: 'ADR-0004: Immutable Digest Container Promotion Lifecycle', url: '0004-immutable-digest-container-promotion.md', category: 'internal' },
      { text: 'OpenGitOps Principles Specification', url: 'https://opengitops.net', category: 'canonical' },
    ],
  },
  {
    id: '0016',
    slug: 'minimal-container-base-images-and-build-security',
    title: 'Minimal Container Base Images and Build Security',
    status: 'accepted',
    deciders: ['Security Engineering Guild', 'DevSecOps Team'],
    date: '2024-07-31',
    story: 'PLAT-210',
    category: 'Container Security',
    dependsOn: ['0004'],
    requiredBy: ['0029'],
    context: 'Standard container builds utilized full Linux distributions (Ubuntu, Debian) as base images. Vulnerability scanners consistently reported hundreds of unpatched OS packages, package managers (apt, curl, bash), and shared libraries that had no purpose in production application execution but dramatically expanded attack surfaces for potential container escapes.',
    drivers: [
      'Radical reduction of container Common Vulnerabilities and Exposures (CVE) count',
      'Removal of package managers, shells, and debugging binaries from production containers',
      'Enforce non-root execution and immutable root filesystems by default',
    ],
    options: [
      {
        name: 'Distroless / Chainguard Minimal Base Images with Multi-Stage Builds',
        description: 'Compile binaries in builder stages, copying only the compiled application and minimal glibc/musl runtimes into stripped distroless images running as unprivileged UID 65532.',
        pros: ['Reduces container vulnerability footprint by over 95%', 'Attackers gaining remote code execution have no shell or package manager to download payloads', 'Smaller image footprint (under 50MB) accelerates node pull times'],
        cons: ['Requires ephemeral debug containers for interactive production troubleshooting', 'Requires multi-stage build discipline across all Dockerfiles'],
      },
      {
        name: 'Full Linux Distribution Base Images with Automated Patching',
        description: 'Continue using Debian-slim base images, running nightly apt upgrade scripts.',
        pros: ['Familiar debugging tools available inside container shells'],
        cons: ['Continuous churn in image layers requiring constant rebuilds', 'Retains high CVE counts in non-essential system utilities'],
      },
    ],
    chosenOption: 'Distroless / Chainguard Minimal Base Images with Multi-Stage Builds',
    rationale: 'Depends on ADR-0004. Defense-in-depth requires eliminating extraneous system binaries from production runtimes. Stripped distroless images deliver auditable, minimal attack surfaces.',
    positiveConsequences: [
      'Security scanner CVE alerts dropped from an average of 140 per image to less than 3.',
      'Node pull latency decreased by 60%, drastically accelerating pod autoscaling response.',
      'Satisfies compliance requirements for non-root execution and read-only root filesystems.',
    ],
    negativeConsequences: [
      'Engineers must learn to use kubectl debug ephemeral containers when diagnosing production container issues.',
      'Native C library dependencies require explicit staging during multi-stage image builds.',
    ],
    links: [
      { text: 'ADR-0004: Immutable Digest Container Promotion Lifecycle', url: '0004-immutable-digest-container-promotion.md', category: 'internal' },
      { text: 'ADR-0029: Admission Control Policy-as-Code with Gatekeeper', url: '0029-admission-control-policy-as-code.md', category: 'internal' },
      { text: 'GoogleContainerTools: Distroless Images', url: 'https://github.com/GoogleContainerTools/distroless', category: 'canonical' },
    ],
  },
  {
    id: '0017',
    slug: 'ephemeral-secrets-management-vault',
    title: 'Ephemeral Secrets Management via Dynamic Vault Leases',
    status: 'accepted',
    deciders: ['Security Architecture WG', 'Platform Operations'],
    date: '2024-08-14',
    story: 'PLAT-218',
    category: 'Secrets Management',
    dependsOn: ['0011'],
    context: 'Application database credentials, third-party API keys, and encryption secrets were managed as static strings committed to encrypted repositories or stored in Kubernetes Secret objects. Because database passwords never changed unless an engineer performed manual rotation, any leaked credential provided indefinite access to production databases.',
    drivers: [
      'Dynamic, just-in-time credential generation with short-lived TTLs (Time-To-Live)',
      'Automated revocation upon pod termination or lease expiration',
      'Centralized audit logging for every secret read and lease renewal event',
    ],
    options: [
      {
        name: 'HashiCorp Vault Dynamic Secrets with Kubernetes Agent Injection',
        description: 'Deploy Vault Agent sidecars that authenticate via Kubernetes Service Account OIDC tokens, generating unique, temporary database credentials valid for one hour and automatically renewing leases.',
        pros: ['Zero static database passwords exist anywhere in the infrastructure', 'Compromised credentials automatically revoke within 60 minutes', 'Granular audit logging captures exact identity and timestamp of all secret accesses'],
        cons: ['Vault cluster becomes a tier-0 mission-critical operational dependency', 'Applications must renew connection pools when credentials rotate dynamically'],
      },
      {
        name: 'Sealed Secrets (Bitnami SealedSecrets in Git)',
        description: 'Encrypt static secrets with cluster public keys and store encrypted manifests in git.',
        pros: ['Integrates smoothly with GitOps repositories'],
        cons: ['Still manages long-lived static credentials', 'Zero automated credential rotation or access audit logging'],
      },
    ],
    chosenOption: 'HashiCorp Vault Dynamic Secrets with Kubernetes Agent Injection',
    rationale: 'Depends on ADR-0011. Static credentials represent persistent liabilities. Dynamic leases force continuous automated credential rotation and limit compromise windows to under one hour.',
    positiveConsequences: [
      'Eliminated shared static database master accounts from application configurations.',
      'Complete visibility into which specific pods requested database credentials and when.',
      'Instant revocation capability for suspect pods without restarting database instances.',
    ],
    negativeConsequences: [
      'High operational burden maintaining an enterprise Vault cluster with multi-region replication.',
      'Application connection pools (e.g., HikariCP, Knex) must support dynamic credential rotation without dropped queries.',
    ],
    links: [
      { text: 'ADR-0011: Workload Identity Federation for Cloud Resources', url: '0011-workload-identity-federation.md', category: 'internal' },
      { text: 'ADR-0012: Hierarchical Dynamic Configuration Management', url: '0012-hierarchical-dynamic-configuration-management.md', category: 'internal' },
      { text: 'HashiCorp Vault Dynamic Secrets Architecture', url: 'https://developer.hashicorp.com/vault/docs/secrets', category: 'canonical' },
    ],
  },
  {
    id: '0018',
    slug: 'grpc-protocol-buffers-internal-rpc',
    title: 'gRPC Protocol Buffers for Low-Latency Internal RPC',
    status: 'accepted',
    deciders: ['Core Systems WG', 'API Governance Guild'],
    date: '2024-08-28',
    story: 'PLAT-225',
    category: 'API Design',
    extends: ['0010'],
    context: 'Synchronous internal microservice communication relied entirely on JSON over HTTP/1.1. In high-frequency checkout and fraud evaluation paths, JSON serialization/deserialization CPU overhead and HTTP/1.1 head-of-line blocking introduced severe tail latency spikes (P99 exceeding 350ms) across cascading service call graphs.',
    drivers: [
      'Low-latency, high-throughput binary serialization with minimal CPU footprint',
      'Multiplexed bidirectional streaming and request cancellation over HTTP/2',
      'Strict, type-safe schema definitions with automated polyglot client generation',
    ],
    options: [
      {
        name: 'gRPC with Protocol Buffers v3 for internal east-west RPC',
        description: 'Define service contracts in .proto files, compiling strongly typed clients and server stubs across Go, Node.js, and Java services while preserving HTTP REST for external north-south clients.',
        pros: ['Up to 7x faster serialization and 30% smaller payload sizes compared to JSON', 'Native multiplexing over single TCP connection via HTTP/2', 'Built-in support for request deadlines, cancellations, and metadata propagation'],
        cons: ['Binary payloads cannot be inspected using standard curl or plain web browsers without reflection tools', 'Load balancers must support L7 HTTP/2 stream multiplexing'],
      },
      {
        name: 'Continue HTTP/1.1 REST JSON with optimized parser libraries',
        description: 'Optimize existing REST controllers using fast JSON serializer libraries (e.g., fast-json-stringify).',
        pros: ['Retains human-readable text payloads and existing HTTP debugging tools'],
        cons: ['Fails to solve HTTP/1.1 connection pooling bottlenecks and socket exhaustion under high concurrency'],
      },
    ],
    chosenOption: 'gRPC with Protocol Buffers v3 for internal east-west RPC',
    rationale: 'Extends ADR-0010. Internal east-west service communication requires binary efficiency and strict type boundaries, while public north-south APIs remain standardized on OpenAPI REST.',
    positiveConsequences: [
      'P99 internal service latency dropped from 350ms to under 45ms across core checkout call graphs.',
      'Compute CPU utilization allocated to JSON parsing dropped by 28% across the cluster.',
      'Strict Protocol Buffer backwards-compatibility rules prevent accidental field numbering collisions.',
    ],
    negativeConsequences: [
      'Debugging requires specialized CLI tools like grpcurl instead of standard curl.',
      'Sidecar Envoy proxies must be configured for HTTP/2 and gRPC keep-alive timeouts.',
    ],
    links: [
      { text: 'ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy', url: '0007-service-mesh-mtls-and-traffic-policy.md', category: 'internal' },
      { text: 'ADR-0010: HTTP REST with OpenAPI Specification Contracts', url: '0010-http-rest-openapi-contracts.md', category: 'internal' },
      { text: 'gRPC Core Concepts and Architecture', url: 'https://grpc.io/docs/what-is-grpc/core-concepts/', category: 'canonical' },
    ],
  },
  {
    id: '0019',
    slug: 'event-driven-streaming-architecture-kafka',
    title: 'Asynchronous Event Streaming Architecture via Apache Kafka',
    status: 'accepted',
    deciders: ['Data Platform WG', 'Distributed Systems Architecture'],
    date: '2024-09-11',
    story: 'PLAT-232',
    category: 'Data Integration',
    supersedes: ['0006'],
    requiredBy: ['0020', '0023'],
    context: 'As identified in ADR-0006, nightly batch ETL cron synchronization led to severe operational delays, data staleness, and database query contention. Services required immediate, durable, decoupled notification of state transitions (orders created, payments processed, inventory decremented) to power real-time analytics, notifications, and downstream workflows.',
    drivers: [
      'Decoupled asynchronous event distribution with high write throughput',
      'Durable, replayable distributed commit log preserving event order by partition key',
      'Schema evolution governance preventing corrupt payloads across consumers',
    ],
    options: [
      {
        name: 'Apache Kafka Distributed Log with Confluent Schema Registry',
        description: 'Publish domain events to partitioned Kafka topics using Apache Avro schemas registered in a central schema registry with strict backward compatibility enforcement.',
        pros: ['Massive throughput capability exceeding 100k events/second with sub-10ms latency', 'Durable, replayable event log enables downstream consumers to rewind and reprocess history', 'Schema Registry guarantees producers cannot publish breaking payload formats'],
        cons: ['Substantial operational overhead managing Kafka broker clusters and ZooKeeper/KRaft quorum', 'Requires careful partition key selection to avoid consumer hot-spotting'],
      },
      {
        name: 'Traditional AMQP Message Broker (RabbitMQ)',
        description: 'Publish messages to RabbitMQ exchanges routed to individual consumer queues.',
        pros: ['Flexible queue routing and consumer acknowledgments', 'Simpler operational footprint for small workloads'],
        cons: ['Messages are deleted upon consumption; cannot rewind or replay historical event streams', 'Scales poorly under high-volume streaming telemetry workloads'],
      },
    ],
    chosenOption: 'Apache Kafka Distributed Log with Confluent Schema Registry',
    rationale: 'Supersedes ADR-0006. The immutable, replayable distributed log model decouples producers from consumers completely, turning the event stream into a verifiable real-time nervous system for the platform.',
    positiveConsequences: [
      'Data propagation latency dropped from 24 hours to under 200 milliseconds.',
      'New services can be onboarded and backfilled by rewinding consumer offsets to the beginning of topics.',
      'Producers and consumers can deploy independently without direct network coupling.',
    ],
    negativeConsequences: [
      'Requires dedicated platform team expertise to manage Kafka cluster health, partition sizing, and compaction.',
      'Developers must account for eventual consistency and out-of-order delivery across different partition keys.',
    ],
    diagram: `graph LR
    P[Order Service (Producer)] -->|Avro Event| SR[Schema Registry]
    P -->|Partition Key: order_id| K[Kafka Topic: orders.events]
    K -->|Offset Stream| C1[Billing Service (Consumer Group 1)]
    K -->|Offset Stream| C2[Inventory Service (Consumer Group 2)]
    K -->|Offset Stream| C3[Analytics Ingestion (Consumer Group 3)]`,
    links: [
      { text: 'ADR-0006: Batch Cron-Based Data Synchronization Between Services', url: '0006-batch-cron-data-synchronization.md', category: 'internal' },
      { text: 'ADR-0020: Distributed Saga Pattern for Cross-Service Coordination', url: '0020-distributed-saga-pattern-coordination.md', category: 'internal' },
      { text: 'ADR-0023: Dead-Letter Queue and Poison Message Processing', url: '0023-dead-letter-queue-and-poison-message-handling.md', category: 'internal' },
      { text: 'Apache Kafka Design Principles', url: 'https://kafka.apache.org/documentation/#design', category: 'canonical' },
    ],
  },
  {
    id: '0020',
    slug: 'distributed-saga-pattern-coordination',
    title: 'Distributed Saga Pattern for Cross-Service Coordination',
    status: 'accepted',
    deciders: ['Distributed Systems WG', 'Financial Services Architecture'],
    date: '2024-09-25',
    story: 'PLAT-240',
    category: 'Distributed Systems',
    dependsOn: ['0019'],
    context: 'Complex business transactions spanning multiple microservices (e.g., reserving inventory, processing credit card charges, updating account balances, and generating shipment labels) required atomic consistency. Traditional distributed two-phase commit (2PC / XA) protocols caused severe database locking, reduced throughput, and created brittle failure modes across microservice boundaries.',
    drivers: [
      'Maintain eventual business consistency across autonomous microservice boundaries',
      'Eliminate distributed lock contention and single points of failure in transactional coordinators',
      'Provide deterministic compensation mechanisms to rollback partial failures gracefully',
    ],
    options: [
      {
        name: 'Choreographed Saga Pattern via Kafka Event Streams',
        description: 'Services react to domain events on Kafka topics, perform local database transactions, and publish subsequent state events. If a downstream step fails, compensating events are published to reverse preceding actions.',
        pros: ['No centralized coordinator bottleneck or single point of failure', 'Services remain completely decoupled, reacting solely to event domain transitions', 'Naturally aligned with asynchronous Kafka event streaming architecture'],
        cons: ['Complex workflow visibility: tracking end-to-end saga status requires distributed tracing correlation', 'Risk of cyclic event loops if event schemas and transitions are poorly designed'],
      },
      {
        name: 'Orchestrated Saga with Central Workflow Engine (Temporal / Camunda)',
        description: 'A centralized workflow engine coordinates steps and invokes service RPC endpoints sequentially.',
        pros: ['Explicit state machine visibility in a central UI', 'Simplified error handling and timeout management'],
        cons: ['Introduces central workflow engine infrastructure dependency', 'Tighter coupling between orchestrator and service interfaces'],
      },
    ],
    chosenOption: 'Choreographed Saga Pattern via Kafka Event Streams',
    rationale: 'Depends on ADR-0019. Event-driven choreography maximizes service autonomy and write throughput, avoiding synchronous coordinator lock-in while leveraging Kafka durable log guarantees for compensating workflows.',
    positiveConsequences: [
      'High-throughput business transactions execute asynchronously without distributed locks.',
      'Partial failures (e.g., payment declined after inventory reservation) trigger automated compensating refund and release events.',
      'System availability remains resilient even if non-critical downstream saga participants experience temporary outages.',
    ],
    negativeConsequences: [
      'Requires comprehensive OpenTelemetry trace propagation to observe multi-stage saga execution.',
      'Developers must carefully write idempotent compensating actions for every forward state mutation.',
    ],
    diagram: `sequenceDiagram
    participant O as Order Service
    participant I as Inventory Service
    participant P as Payment Service
    O->>I: Event: OrderCreated
    Note over I: Reserve Stock
    I->>P: Event: InventoryReserved
    alt Payment Successful
        Note over P: Charge Card
        P->>O: Event: PaymentCompleted
        Note over O: Order Marked Confirmed
    else Payment Declined
        Note over P: Payment Failed
        P->>I: Event: PaymentFailed (Compensating)
        Note over I: Release Stock
        P->>O: Event: OrderCancelled
    end`,
    links: [
      { text: 'ADR-0005: Stateless Service Architecture and Session Externalization', url: '0005-stateless-service-session-externalization.md', category: 'internal' },
      { text: 'ADR-0019: Asynchronous Event Streaming Architecture via Apache Kafka', url: '0019-event-driven-streaming-architecture-kafka.md', category: 'internal' },
      { text: 'Pattern: Saga in Distributed Architectures', url: 'https://microservices.io/patterns/data/saga.html', category: 'canonical' },
    ],
  },
];
