# ADR-0005: Stateless Service Architecture and Session Externalization

* Status: accepted
* Deciders: Distributed Systems WG, Platform Architecture WG
* Date: 2024-03-01
Technical Story: PLAT-128
* Category: Architecture Patterns
* Required by: ADR-0021, ADR-0024

## Context and Problem Statement

Early web services stored user sessions, in-flight transaction states, and authentication context directly in process heap memory. This in-memory state necessitated sticky routing at the load balancer, prevented horizontal auto-scaling, and caused abrupt user logouts or session drops whenever instances were recycled during routine deployments.

## Decision Drivers

* Horizontal autoscaling without traffic affinity or sticky session constraints
* Zero-downtime rolling upgrades with arbitrary pod termination
* Fault tolerance against unexpected compute host failures

## Considered Options

* Option 1: Strictly Stateless Compute with Redis Cluster Session Store
* Option 2: Sticky session routing with local memory cache
* Option 3: Stateless Client Tokens (Encrypted JWTs)

## Decision Outcome

Chosen option: "Strictly Stateless Compute with Redis Cluster Session Store", because Externalizing state into a dedicated high-throughput Redis tier decouples lifecycle management between compute pods and user context. Compute instances become truly disposable cattle rather than pets.

### Positive Consequences

* Workloads scale elastically based on CPU/RAM metrics without dropping active sessions.
* Rolling deployments can terminate instances without draining sticky user connections.
* Enables rapid disaster recovery failover to alternative compute zones.

### Negative Consequences

* Redis cluster becomes load-bearing infrastructure requiring automated failover and backup.
* Services must handle connection pools and transient Redis timeouts gracefully.

## Pros and Cons of the Options

### Option 1: Strictly Stateless Compute with Redis Cluster Session Store

Remove all in-process state; store ephemeral session tokens and shared operational states in a distributed, replicated Redis cluster.

* Good, because Any service instance can fulfill any request
* Good, because Instances can be terminated instantly without state loss
* Good, because Linear horizontal scaling via metrics-based autoscalers
* Bad, because Network hop latency (1-2ms) on session lookup
* Bad, because Introduces operational dependency on high-availability Redis cluster

### Option 2: Sticky session routing with local memory cache

Use reverse proxy cookies to pin users to specific backend compute pods.

* Good, because Sub-millisecond local RAM lookups
* Good, because No external caching infrastructure required
* Bad, because Uneven traffic distribution across backend fleet
* Bad, because Pod termination results in lost user sessions and cart drops

### Option 3: Stateless Client Tokens (Encrypted JWTs)

Encode all user identity and session claims directly in signed client-side tokens.

* Good, because Zero server-side lookup state
* Good, because No external session store required
* Bad, because Difficult to implement instant token revocation or session invalidation
* Bad, because Large HTTP header payload size overhead on every request

## Links and Primary Sources

### Internal Platform Links
* [ADR-0021: Distributed Read-Through Query Caching via Redis](0021-read-heavy-query-caching-redis.md)
* [ADR-0024: Idempotent API Request Processing with Distributed Locks](0024-idempotent-api-request-handling.md)

### Canonical Primary Sources
* [Twelve-Factor App: Processes (Stateless)](https://12factor.net/processes)

