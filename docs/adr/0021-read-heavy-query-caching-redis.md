# ADR-0021: Distributed Read-Through Query Caching via Redis

* Status: accepted
* Deciders: Data Platform WG, Core Systems Team
* Date: 2024-10-09
Technical Story: PLAT-248
* Category: Caching and Performance
* Depends on: ADR-0005

## Context and Problem Statement

High-frequency read queries for product catalog definitions, regional tax matrices, and currency exchange rates placed unsustainable query load on primary relational databases, driving database CPU above 85% and causing connection pool starvation during marketing events.

## Decision Drivers

* Sub-5ms query response times for read-heavy static and semi-static reference data
* Shield primary relational databases from repetitive read spikes
* Deterministic cache invalidation preventing stale data propagation

## Considered Options

* Option 1: Cache-Aside with Redis Cluster and TTL Jitter
* Option 2: Relational Database Read-Replica Pool Scaling

## Decision Outcome

Chosen option: "Cache-Aside with Redis Cluster and TTL Jitter", because Depends on ADR-0005. Leveraging the existing enterprise Redis tier for cache-aside query offloading dramatically improves P99 query latency while drastically cutting relational database compute costs.

### Positive Consequences

* Primary database CPU dropped from 85% peak to under 25% during major traffic spikes.
* P99 read latency for catalog data dropped from 65ms to 2.8ms.
* Randomized TTL jitter eliminated thundering herd cache stampedes.

### Negative Consequences

* Engineers must ensure all data mutations publish cache invalidation signals.
* Increases operational sizing requirements for the distributed Redis cluster.

## Pros and Cons of the Options

### Option 1: Cache-Aside with Redis Cluster and TTL Jitter

Applications query Redis first; on cache miss, query the database, populate Redis with a randomized TTL jitter (e.g., 300s +/- 30s), and return the result. Asynchronous event subscribers invalidate specific keys upon updates.

* Good, because Reduces database read query load by over 75%
* Good, because TTL jitter prevents cache stampede (thundering herd) upon expiration
* Good, because Resilient: database remains accessible if cache experiences temporary hiccups
* Bad, because Applications must manage cache serialization and miss logic
* Bad, because Potential for transient eventual consistency windows if invalidation events lag

### Option 2: Relational Database Read-Replica Pool Scaling

Scale horizontal PostgreSQL read replicas behind a connection pool proxy (PgBouncer).

* Good, because Transparent to application code without caching layer logic
* Bad, because High infrastructure expense scaling multi-gigabyte database replicas
* Bad, because Replication lag still introduces stale read conditions under heavy write loads

## Links and Primary Sources

### Internal Platform Links
* [ADR-0005: Stateless Service Architecture and Session Externalization](0005-stateless-service-session-externalization.md)
* [ADR-0022: Expand-Contract Schema Evolution for Zero Downtime](0022-expand-contract-database-migrations.md)

### Canonical Primary Sources
* [Redis Caching Patterns and Best Practices](https://redis.io/docs/manual/client-side-caching/)

