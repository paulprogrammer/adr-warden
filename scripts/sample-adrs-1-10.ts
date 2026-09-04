export interface AdrOption {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
}

export interface AdrDef {
  id: string;
  slug: string;
  title: string;
  status: string;
  deciders: string[];
  date: string;
  story: string;
  category: string;
  supersedes?: string[];
  supersededBy?: string[];
  dependsOn?: string[];
  requiredBy?: string[];
  extends?: string[];
  amends?: string[];
  context: string;
  drivers: string[];
  options: AdrOption[];
  chosenOption: string;
  rationale: string;
  positiveConsequences: string[];
  negativeConsequences: string[];
  diagram?: string;
  links: Array<{ text: string; url: string; category: 'internal' | 'canonical' }>;
}

export const ADRS_1_TO_10: AdrDef[] = [
  {
    id: '0001',
    slug: 'static-file-runtime-configuration',
    title: 'Static File Runtime Configuration',
    status: 'superseded',
    deciders: ['Platform Architecture WG', 'Core Infrastructure Team'],
    date: '2024-01-15',
    story: 'PLAT-101',
    category: 'Configuration Management',
    supersededBy: ['0012'],
    context: 'Initial platform deployments relied on environment-specific JSON and YAML configuration files baked directly into machine images or copied onto hosts during bootstrapping. As the fleet scaled across development, staging, and production environments, modifying a single timeout or connection string required rebuilding and re-provisioning host images, introducing operational friction and configuration drift.',
    drivers: [
      'Simplicity of local filesystem inspection',
      'Zero external runtime dependencies during service bootstrap',
      'Deterministic configuration state per machine deployment',
    ],
    options: [
      {
        name: 'Bake static config files per environment into host images',
        description: 'Package separate configuration bundles per environment directly in machine templates.',
        pros: ['Zero network call overhead during bootstrap', 'Immune to remote service discovery outages'],
        cons: ['Requires full image rebuild to rotate non-secret parameters', 'Severe configuration drift across environments'],
      },
      {
        name: 'Pass configuration solely through POSIX environment variables',
        description: 'Inject all parameters into host environments at invocation time.',
        pros: ['Adheres to Twelve-Factor App guidelines', 'Easy to override in local testing'],
        cons: ['Lacks structural validation for nested schemas', 'Risk of accidental leakage in process dumps and logs'],
      },
    ],
    chosenOption: 'Bake static config files per environment into host images',
    rationale: 'Prioritized rapid initial bootstrap reliability and self-contained execution while operational footprint was limited to a single cloud region.',
    positiveConsequences: [
      'Services started deterministically without relying on network configuration servers.',
      'Configuration inspection was trivial using standard text editors and shell utilities.',
    ],
    negativeConsequences: [
      'Created significant configuration drift across long-running instances.',
      'Required full packaging pipeline execution for trivial parameter updates.',
    ],
    links: [
      { text: 'ADR-0012: Hierarchical Dynamic Configuration Management', url: '0012-hierarchical-dynamic-configuration-management.md', category: 'internal' },
      { text: 'Twelve-Factor App: Config', url: 'https://12factor.net/config', category: 'canonical' },
    ],
  },
  {
    id: '0002',
    slug: 'semantic-versioning-and-release-tagging',
    title: 'Semantic Versioning and Release Tagging Standards',
    status: 'accepted',
    deciders: ['Release Engineering Guild', 'Platform Architecture WG'],
    date: '2024-01-22',
    story: 'PLAT-104',
    category: 'Release Engineering',
    requiredBy: ['0004', '0015'],
    context: 'Engineering teams previously utilized inconsistent release identifiers ranging from arbitrary date stamps to sequential build numbers and commit hashes. Downstream consumer services had no automated mechanism to determine whether an updated shared library, container image, or API client contained non-breaking bug fixes, backward-compatible additions, or breaking interface contracts.',
    drivers: [
      'Deterministic compatibility contract for shared libraries and service contracts',
      'Automated dependency update gating and continuous deployment safety',
      'Clear audit trails between git tags, packages, and deployed artifacts',
    ],
    options: [
      {
        name: 'Semantic Versioning 2.0.0 (MAJOR.MINOR.PATCH)',
        description: 'Standardized SemVer format indicating breaking changes (MAJOR), compatible features (MINOR), and fixes (PATCH).',
        pros: ['Universal ecosystem tooling support', 'Predictable risk assessment for dependency updates'],
        cons: ['Requires strict API boundary discipline from developers', 'Requires enforcement in automated pull request linters'],
      },
      {
        name: 'Calendar Versioning (CalVer YYYY.MM.MICRO)',
        description: 'Version based on release calendar dates.',
        pros: ['Immediately communicates age of deployed software', 'Intuitive for scheduled release trains'],
        cons: ['Conveys zero structural information regarding interface compatibility', 'Dangerous for automated dependency resolution'],
      },
    ],
    chosenOption: 'Semantic Versioning 2.0.0 (MAJOR.MINOR.PATCH)',
    rationale: 'SemVer provides a verifiable contract between producers and consumers. Coupled with conventional commits, automated CI tooling can bump patch and minor versions deterministically without manual release council gates.',
    positiveConsequences: [
      'Automated dependency managers can safely auto-merge patch and minor updates.',
      'Release tags map 1-to-1 to verifiable git commits and immutable artifact bundles.',
    ],
    negativeConsequences: [
      'Developers must categorize breaking changes strictly; accidental breaking changes necessitate immediate major bumps.',
      'Requires enforcing conventional commits in pull request validation pipelines.',
    ],
    links: [
      { text: 'ADR-0004: Immutable Digest Container Promotion Lifecycle', url: '0004-immutable-digest-container-promotion.md', category: 'internal' },
      { text: 'Semantic Versioning 2.0.0 Specification', url: 'https://semver.org', category: 'canonical' },
    ],
  },
  {
    id: '0003',
    slug: 'direct-host-process-execution',
    title: 'Direct Host Process Execution on Persistent Instances',
    status: 'superseded',
    deciders: ['Core Systems Team', 'Platform Operations'],
    date: '2024-02-05',
    story: 'PLAT-112',
    category: 'Deployment Infrastructure',
    supersededBy: ['0015'],
    context: 'Services were initially deployed as native systemd background daemons directly on long-lived virtual machines provisioned via static configuration scripts. Over time, host operating system packages drifted, library version conflicts arose between co-located services, and rolling deployments caused intermittent service degradation during in-place daemon restarts.',
    drivers: [
      'Familiar operational paradigm using standard Linux systemd utilities',
      'Direct hardware access without virtualization overhead',
      'Minimal early architectural complexity',
    ],
    options: [
      {
        name: 'Direct systemd host service management',
        description: 'Deploy compiled application artifacts directly onto bare VMs managed by systemd units.',
        pros: ['Low runtime memory overhead', 'Familiar debugging via journalctl and systemctl'],
        cons: ['Mutable host state causes insidious environment drift', 'Hard to isolate CPU, memory, and noisy neighbor processes'],
      },
      {
        name: 'Containerized process isolation on hosts',
        description: 'Encapsulate services in OCI containers managed by a local container engine.',
        pros: ['Hermetic dependency encapsulation', 'Predictable resource constraints per container'],
        cons: ['Introduces container engine daemon management on every VM host'],
      },
    ],
    chosenOption: 'Direct systemd host service management',
    rationale: 'Selected initially to minimize operational surface area before the platform team developed automated container orchestration capabilities.',
    positiveConsequences: [
      'Fast onboarding for engineers experienced with traditional Linux service debugging.',
      'Low initial infrastructure costs with no dedicated orchestration control planes.',
    ],
    negativeConsequences: [
      'Severe snowflake host syndrome across production fleets.',
      'Failed deployments required manual host rollbacks and high engineering intervention.',
    ],
    links: [
      { text: 'ADR-0015: Declarative GitOps Application Delivery', url: '0015-declarative-gitops-continuous-delivery.md', category: 'internal' },
      { text: 'Systemd Architecture Documentation', url: 'https://systemd.io', category: 'canonical' },
    ],
  },
  {
    id: '0004',
    slug: 'immutable-digest-container-promotion',
    title: 'Immutable Digest Container Promotion Lifecycle',
    status: 'accepted',
    deciders: ['Platform Architecture WG', 'Security Engineering', 'Release Engineering'],
    date: '2024-02-18',
    story: 'PLAT-120',
    category: 'Release Engineering',
    dependsOn: ['0002'],
    requiredBy: ['0007', '0015', '0016'],
    context: 'Teams frequently rebuilt container images when promoting code from testing to staging and production, leading to subtle runtime discrepancies caused by upstream package updates, differing build-time timestamps, or floating base tags. We required a deterministic, verifiable artifact promotion pipeline where what is tested in staging is bit-for-bit identical to what runs in production.',
    drivers: [
      'Elimination of environment drift between pre-production testing and production execution',
      'Cryptographically auditable provenance from source commit to deployed container',
      'Rapid rollback speed avoiding rebuild cycles during operational incidents',
    ],
    options: [
      {
        name: 'Build Once and Promote by Immutable SHA-256 Digest',
        description: 'Build and test the OCI container image once in CI, publish by content addressable sha256 digest, and promote that exact digest across all environments.',
        pros: ['Guaranteed identical binary execution across environments', 'Cryptographic verification via digital signatures', 'Fast promotions requiring zero recompilation'],
        cons: ['Configuration cannot be baked into images and must be strictly externalized', 'Requires robust multi-tenant container registry with replication'],
      },
      {
        name: 'Rebuild image per environment using environment-specific Dockerfiles',
        description: 'Trigger separate builds with environment flags in each deployment pipeline.',
        pros: ['Allows embedding environment specifics into static artifacts'],
        cons: ['Destroys auditability; staging verification does not prove production stability', 'Vulnerable to upstream dependency drift during emergency hotfixes'],
      },
    ],
    chosenOption: 'Build Once and Promote by Immutable SHA-256 Digest',
    rationale: 'Deterministic deployment guarantees require content-addressable immutability. The SHA-256 image digest represents a verifiable artifact contract that cannot be altered or spoofed after verification.',
    positiveConsequences: [
      'Staging verification directly certifies the exact binary payload that runs in production.',
      'Rollbacks execute in seconds by repointing deployments to a previous known-good digest.',
      'Enables binary authorization and cryptographic signature verification before pod scheduling.',
    ],
    negativeConsequences: [
      'Forces absolute externalization of environment configurations and credentials.',
      'Artifact storage footprint increases, requiring automated lifecycle pruning for untagged historical digests.',
    ],
    diagram: `graph TD
    CI[CI Pipeline: Build & Test] -->|Compile & Package| IMG[OCI Image: sha256:abc1234...]
    IMG -->|Sign with Cosign| REG[Enterprise Container Registry]
    REG -->|Promote Digest| DEV[Dev Environment]
    REG -->|Promote Digest| STG[Staging Verification]
    REG -->|Promote Digest| PRD[Production Cluster]
    style IMG fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;`,
    links: [
      { text: 'ADR-0002: Semantic Versioning and Release Tagging Standards', url: '0002-semantic-versioning-and-release-tagging.md', category: 'internal' },
      { text: 'ADR-0015: Declarative GitOps Application Delivery', url: '0015-declarative-gitops-continuous-delivery.md', category: 'internal' },
      { text: 'OCI Image Format Specification', url: 'https://opencontainers.org/specs/image/', category: 'canonical' },
    ],
  },
  {
    id: '0005',
    slug: 'stateless-service-session-externalization',
    title: 'Stateless Service Architecture and Session Externalization',
    status: 'accepted',
    deciders: ['Distributed Systems WG', 'Platform Architecture WG'],
    date: '2024-03-01',
    story: 'PLAT-128',
    category: 'Architecture Patterns',
    requiredBy: ['0021', '0024'],
    context: 'Early web services stored user sessions, in-flight transaction states, and authentication context directly in process heap memory. This in-memory state necessitated sticky routing at the load balancer, prevented horizontal auto-scaling, and caused abrupt user logouts or session drops whenever instances were recycled during routine deployments.',
    drivers: [
      'Horizontal autoscaling without traffic affinity or sticky session constraints',
      'Zero-downtime rolling upgrades with arbitrary pod termination',
      'Fault tolerance against unexpected compute host failures',
    ],
    options: [
      {
        name: 'Strictly Stateless Compute with Redis Cluster Session Store',
        description: 'Remove all in-process state; store ephemeral session tokens and shared operational states in a distributed, replicated Redis cluster.',
        pros: ['Any service instance can fulfill any request', 'Instances can be terminated instantly without state loss', 'Linear horizontal scaling via metrics-based autoscalers'],
        cons: ['Network hop latency (1-2ms) on session lookup', 'Introduces operational dependency on high-availability Redis cluster'],
      },
      {
        name: 'Sticky session routing with local memory cache',
        description: 'Use reverse proxy cookies to pin users to specific backend compute pods.',
        pros: ['Sub-millisecond local RAM lookups', 'No external caching infrastructure required'],
        cons: ['Uneven traffic distribution across backend fleet', 'Pod termination results in lost user sessions and cart drops'],
      },
      {
        name: 'Stateless Client Tokens (Encrypted JWTs)',
        description: 'Encode all user identity and session claims directly in signed client-side tokens.',
        pros: ['Zero server-side lookup state', 'No external session store required'],
        cons: ['Difficult to implement instant token revocation or session invalidation', 'Large HTTP header payload size overhead on every request'],
      },
    ],
    chosenOption: 'Strictly Stateless Compute with Redis Cluster Session Store',
    rationale: 'Externalizing state into a dedicated high-throughput Redis tier decouples lifecycle management between compute pods and user context. Compute instances become truly disposable cattle rather than pets.',
    positiveConsequences: [
      'Workloads scale elastically based on CPU/RAM metrics without dropping active sessions.',
      'Rolling deployments can terminate instances without draining sticky user connections.',
      'Enables rapid disaster recovery failover to alternative compute zones.',
    ],
    negativeConsequences: [
      'Redis cluster becomes load-bearing infrastructure requiring automated failover and backup.',
      'Services must handle connection pools and transient Redis timeouts gracefully.',
    ],
    links: [
      { text: 'ADR-0021: Distributed Read-Through Query Caching via Redis', url: '0021-read-heavy-query-caching-redis.md', category: 'internal' },
      { text: 'ADR-0024: Idempotent API Request Processing with Distributed Locks', url: '0024-idempotent-api-request-handling.md', category: 'internal' },
      { text: 'Twelve-Factor App: Processes (Stateless)', url: 'https://12factor.net/processes', category: 'canonical' },
    ],
  },
  {
    id: '0006',
    slug: 'batch-cron-data-synchronization',
    title: 'Batch Cron-Based Data Synchronization Between Services',
    status: 'superseded',
    deciders: ['Data Platform WG', 'Operations Lead'],
    date: '2024-03-15',
    story: 'PLAT-135',
    category: 'Data Integration',
    supersededBy: ['0019'],
    context: 'Downstream analytics, inventory reconciliation, and billing services required data produced by the primary order management system. To avoid coupling transactional services with direct synchronous HTTP calls, an initial cron-based nightly batch export was implemented to extract database dumps, transform them into CSV files, and upload them to cloud storage buckets.',
    drivers: [
      'Simple point-to-point batch execution using standard SQL queries',
      'Zero real-time coordination between engineering teams',
      'Low initial operational infrastructure requirement',
    ],
    options: [
      {
        name: 'Nightly batch extraction jobs via scheduled cron containers',
        description: 'Run SQL select queries against read-replicas every night and write bulk files to storage.',
        pros: ['Straightforward implementation using existing relational databases', 'Predictable off-peak database load'],
        cons: ['Data staleness of up to 24 hours', 'Massive batch job execution windows vulnerable to mid-stream failures requiring full re-runs'],
      },
      {
        name: 'Immediate event streaming across message bus',
        description: 'Stream domain events asynchronously as state transitions occur.',
        pros: ['Near real-time data propagation', 'Fine-grained failure isolation per message'],
        cons: ['Higher architectural complexity requiring dedicated streaming brokers and schema governance'],
      },
    ],
    chosenOption: 'Nightly batch extraction jobs via scheduled cron containers',
    rationale: 'Allowed initial feature delivery within tight timelines before the platform established enterprise streaming infrastructure.',
    positiveConsequences: [
      'Rapid time-to-market for early downstream reporting systems.',
      'Transactional databases were shielded from daytime analytical query loads.',
    ],
    negativeConsequences: [
      'Business operations were hamstrung by 24-hour data latency.',
      'Batch processing bottlenecks caused cascading delays when daily transaction volumes spiked.',
    ],
    links: [
      { text: 'ADR-0019: Asynchronous Event Streaming Architecture via Kafka', url: '0019-event-driven-streaming-architecture-kafka.md', category: 'internal' },
      { text: 'Designing Data-Intensive Applications: Batch Processing', url: 'https://dataintensive.net', category: 'canonical' },
    ],
  },
  {
    id: '0007',
    slug: 'service-mesh-mtls-and-traffic-policy',
    title: 'Service Mesh Mutual TLS and Zero-Trust Traffic Policy',
    status: 'accepted',
    deciders: ['Security Engineering Guild', 'Platform Architecture WG'],
    date: '2024-03-29',
    story: 'PLAT-142',
    category: 'Networking and Security',
    dependsOn: ['0004', '0011'],
    requiredBy: ['0013', '0025'],
    context: 'With the migration toward distributed microservices running across multi-tenant container clusters, internal network traffic traversed flat cluster overlay networks without encryption or cryptographic identity validation. Any compromised pod could theoretically sniff internal payload traffic or spoof RPC requests to privileged backend payment and customer services.',
    drivers: [
      'Enforce zero-trust network posture: encrypt all transit traffic by default',
      'Cryptographic SPIFFE/SPIRE pod identity validation independent of IP addresses',
      'Centralized layer 7 authorization policies without bespoke application code',
    ],
    options: [
      {
        name: 'Envoy-based Sidecar Service Mesh (Istio / Linkerd)',
        description: 'Inject lightweight sidecar proxies into every pod to automatically negotiate mTLS, manage short-lived certificates, and enforce L7 authorization policies.',
        pros: ['Transparent mTLS without altering application code', 'Granular traffic splitting, circuit breaking, and telemetry generation', 'Automatic short-lived certificate rotation'],
        cons: ['Adds 1-3ms network hop latency per service hop', 'Increases container memory consumption per pod'],
      },
      {
        name: 'Application-Level TLS (mTLS configured within language runtimes)',
        description: 'Manage TLS certificates and keystores directly in language services.',
        pros: ['No sidecar proxy memory overhead'],
        cons: ['Massive developer overhead managing certificate libraries across polyglot languages', 'High risk of misconfiguration and manual certificate expiry outages'],
      },
    ],
    chosenOption: 'Envoy-based Sidecar Service Mesh (Istio / Linkerd)',
    rationale: 'A sidecar service mesh provides verifiable cryptographic identity and ubiquitous in-transit encryption across polyglot microservices without pushing certificate lifecycle toil onto application teams.',
    positiveConsequences: [
      'All internal pod-to-pod communication is encrypted with modern TLS 1.3 ciphers.',
      'Security policies enforce least-privilege traffic access via declarative AuthorizationPolicy resources.',
      'Generates rich golden-signals telemetry out of the box.',
    ],
    negativeConsequences: [
      'Sidecar memory consumption requires careful resource profiling and proxy tuning.',
      'Complex debugging workflows when proxy configurations conflict with application keep-alives.',
    ],
    diagram: `sequenceDiagram
    participant S1 as Service A (App)
    participant E1 as Service A (Envoy)
    participant E2 as Service B (Envoy)
    participant S2 as Service B (App)
    S1->>E1: Plaintext Localhost HTTP
    E1->>E2: Mutual TLS (SPIFFE Identity Verification)
    E2->>S2: Plaintext Localhost HTTP
    Note over E1,E2: Dynamic Cert Rotation via Mesh CA`,
    links: [
      { text: 'ADR-0004: Immutable Digest Container Promotion Lifecycle', url: '0004-immutable-digest-container-promotion.md', category: 'internal' },
      { text: 'ADR-0011: Workload Identity Federation for Cloud Resources', url: '0011-workload-identity-federation.md', category: 'internal' },
      { text: 'ADR-0013: Progressive Delivery and Canary Traffic Splitting', url: '0013-progressive-delivery-and-canary-rollouts.md', category: 'internal' },
      { text: 'SPIFFE Standard: Secure Production Identity Framework', url: 'https://spiffe.io', category: 'canonical' },
    ],
  },
  {
    id: '0008',
    slug: 'monolithic-shared-relational-database',
    title: 'Monolithic Shared Relational Database Schema',
    status: 'superseded',
    deciders: ['Core Systems Team', 'Data Architecture'],
    date: '2024-04-10',
    story: 'PLAT-150',
    category: 'Persistence Architecture',
    supersededBy: ['0022'],
    context: 'Multiple independent microservices were connected directly to a single shared relational database instance, querying and mutating shared tables using foreign keys and cross-domain joins. While this simplified early reporting and avoided distributed data synchronization, database schema migrations by one team frequently broke dependent services without warning.',
    drivers: [
      'Single system of record with native ACID transaction guarantees',
      'Convenient relational JOIN queries across disparate business domains',
      'Minimal operational database maintenance overhead',
    ],
    options: [
      {
        name: 'Single shared monolithic database schema',
        description: 'All services share a central database instance and read/write common tables.',
        pros: ['Zero distributed transaction complexity', 'Immediate data consistency across all services'],
        cons: ['Tight operational coupling; migrations cause cascading outages', 'Single point of failure and database connection exhaustion'],
      },
      {
        name: 'Database-per-service with decoupled schema migrations',
        description: 'Isolate each microservice to its own schema or dedicated database instance.',
        pros: ['Independent service release lifecycles', 'Strict domain boundary enforcement'],
        cons: ['Requires distributed communication for cross-domain queries'],
      },
    ],
    chosenOption: 'Single shared monolithic database schema',
    rationale: 'Adopted during early platform inception to maintain rapid transactional feature velocity prior to establishing bounded context isolation.',
    positiveConsequences: [
      'Simplified early database administration and unified backup routines.',
      'Developers could execute complex cross-entity relational queries without network overhead.',
    ],
    negativeConsequences: [
      'Created critical release bottlenecks: schema migrations required cross-team deployment locks.',
      'Database connection pool starvation during traffic surges disabled all platform services simultaneously.',
    ],
    links: [
      { text: 'ADR-0022: Expand-Contract Schema Evolution for Zero Downtime', url: '0022-expand-contract-database-migrations.md', category: 'internal' },
      { text: 'Database-per-service Pattern', url: 'https://microservices.io/patterns/data/database-per-service.html', category: 'canonical' },
    ],
  },
  {
    id: '0009',
    slug: 'centralized-structured-json-logging',
    title: 'Centralized Structured JSON Logging Standards',
    status: 'accepted',
    deciders: ['Observability Guild', 'Platform Architecture WG'],
    date: '2024-04-24',
    story: 'PLAT-158',
    category: 'Observability',
    requiredBy: ['0025'],
    context: 'Service logs were previously printed as unstructured multi-line strings directly to stdout or local log files. When production incidents occurred, parsing stack traces, correlating distributed call sequences, and filtering by customer or order identifiers required fragile ad-hoc grep and regex commands across log aggregation systems.',
    drivers: [
      'Machine-parseable log envelopes across all programming languages',
      'Contextual distributed request correlation via standardized trace and span IDs',
      'Compliance with data privacy controls (automatic PII masking)',
    ],
    options: [
      {
        name: 'Standardized Structured JSON Logging to stdout',
        description: 'Emit single-line JSON log objects to stdout containing standardized schema keys (timestamp, level, service, trace_id, message, context).',
        pros: ['Zero custom parsing logic needed in log shippers', 'Enables high-speed indexing and filtering in centralized log stores', 'Facilitates automated PII scrubber middleware'],
        cons: ['Harder to read raw in local terminal output without formatting CLI tools'],
      },
      {
        name: 'Human-readable formatted text logging',
        description: 'Maintain traditional log formats like pattern layouts.',
        pros: ['Aesthetic readability during local debugging'],
        cons: ['Brittle regex parsing in log indexers; multi-line stack traces break ingestion chunks'],
      },
    ],
    chosenOption: 'Standardized Structured JSON Logging to stdout',
    rationale: 'At enterprise scale, log consumers are automated indexing pipelines and alerting agents, not humans reading raw terminal output. Single-line structured JSON is the industry baseline for reliable ingestion.',
    positiveConsequences: [
      'Log indexing throughput increased by 40% due to elimination of complex regex parsing.',
      'Incident triage MTTR decreased significantly through instant filtering by trace_id and error_code.',
      'Automated alerting rules evaluate structured fields with deterministic accuracy.',
    ],
    negativeConsequences: [
      'Developers must use terminal JSON formatters during local debugging.',
      'Log payload volume increased slightly due to explicit key names on every log line.',
    ],
    links: [
      { text: 'ADR-0005: Stateless Service Architecture and Session Externalization', url: '0005-stateless-service-session-externalization.md', category: 'internal' },
      { text: 'ADR-0025: Distributed Tracing and OpenTelemetry Semantic Conventions', url: '0025-opentelemetry-distributed-tracing-standards.md', category: 'internal' },
      { text: 'OpenTelemetry Logging Specification', url: 'https://opentelemetry.io/docs/specs/otel/logs/', category: 'canonical' },
    ],
  },
  {
    id: '0010',
    slug: 'http-rest-openapi-contracts',
    title: 'HTTP REST with OpenAPI Specification Contracts',
    status: 'accepted',
    deciders: ['API Governance Guild', 'Architecture Review Board'],
    date: '2024-05-08',
    story: 'PLAT-165',
    category: 'API Design',
    requiredBy: ['0014', '0018', '0024'],
    context: 'Public and partner APIs suffered from undocumented endpoints, inconsistent pagination parameters, unversioned breaking response changes, and lagging hand-written client documentation. Integration teams lost significant velocity attempting to discover payload schemas through trial-and-error network inspections.',
    drivers: [
      'Machine-readable, single source of truth for all public and internal REST interfaces',
      'Automated client SDK and mock server generation in developer environments',
      'Automated CI schema linting and backward-compatibility verification',
    ],
    options: [
      {
        name: 'OpenAPI 3.1 Contract-First Specification',
        description: 'Define API schemas in OpenAPI 3.1 YAML contracts prior to writing code, validating requests and responses via automated middleware.',
        pros: ['Strict structural validation against JSON Schema 2020-12', 'Vibrant tooling ecosystem for documentation, mocks, and SDK generation', 'Enables automated breaking change detection in CI pull requests'],
        cons: ['Requires contract governance discipline before writing business logic', 'Learning curve for developers unfamiliar with OpenAPI specifications'],
      },
      {
        name: 'Code-First Schema Generation',
        description: 'Write application routes and generate documentation dynamically from code reflections.',
        pros: ['Faster initial prototyping for developers'],
        cons: ['Documentation frequently drifts from intended business models', 'Schema evolution is obscured by code refactoring'],
      },
    ],
    chosenOption: 'OpenAPI 3.1 Contract-First Specification',
    rationale: 'API contracts are long-term commitments. Contract-first design forces teams to think critically about resource modeling, idempotency, and error envelopes before committing code.',
    positiveConsequences: [
      'Interactive documentation is continuously up-to-date in developer portals.',
      'Automated CI linters block pull requests that introduce breaking changes without proper versioning.',
      'Frontend and backend teams can develop in parallel against mock servers generated from the contract.',
    ],
    negativeConsequences: [
      'Adds an upfront design review phase to API development cycles.',
      'Requires maintaining OpenAPI linting rulesets across all service repositories.',
    ],
    links: [
      { text: 'ADR-0014: Edge API Gateway Rate Limiting and WAF Policy', url: '0014-rate-limiting-and-api-gateway-enforcement.md', category: 'internal' },
      { text: 'ADR-0018: gRPC Protocol Buffers for Low-Latency Internal RPC', url: '0018-grpc-protocol-buffers-internal-rpc.md', category: 'internal' },
      { text: 'ADR-0024: Idempotent API Request Processing with Distributed Locks', url: '0024-idempotent-api-request-handling.md', category: 'internal' },
      { text: 'OpenAPI Specification v3.1.0', url: 'https://spec.openapis.org/oas/v3.1.0', category: 'canonical' },
    ],
  },
];
