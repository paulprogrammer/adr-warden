# ADR-0008: Monolithic Shared Relational Database Schema

* Status: superseded by [ADR-0022](0022-expand-contract-database-migrations.md)
* Deciders: Core Systems Team, Data Architecture
* Date: 2024-04-10
Technical Story: PLAT-150
* Category: Persistence Architecture
* Superseded by: ADR-0022

## Context and Problem Statement

Multiple independent microservices were connected directly to a single shared relational database instance, querying and mutating shared tables using foreign keys and cross-domain joins. While this simplified early reporting and avoided distributed data synchronization, database schema migrations by one team frequently broke dependent services without warning.

## Decision Drivers

* Single system of record with native ACID transaction guarantees
* Convenient relational JOIN queries across disparate business domains
* Minimal operational database maintenance overhead

## Considered Options

* Option 1: Single shared monolithic database schema
* Option 2: Database-per-service with decoupled schema migrations

## Decision Outcome

Chosen option: "Single shared monolithic database schema", because Adopted during early platform inception to maintain rapid transactional feature velocity prior to establishing bounded context isolation.

### Positive Consequences

* Simplified early database administration and unified backup routines.
* Developers could execute complex cross-entity relational queries without network overhead.

### Negative Consequences

* Created critical release bottlenecks: schema migrations required cross-team deployment locks.
* Database connection pool starvation during traffic surges disabled all platform services simultaneously.

## Pros and Cons of the Options

### Option 1: Single shared monolithic database schema

All services share a central database instance and read/write common tables.

* Good, because Zero distributed transaction complexity
* Good, because Immediate data consistency across all services
* Bad, because Tight operational coupling; migrations cause cascading outages
* Bad, because Single point of failure and database connection exhaustion

### Option 2: Database-per-service with decoupled schema migrations

Isolate each microservice to its own schema or dedicated database instance.

* Good, because Independent service release lifecycles
* Good, because Strict domain boundary enforcement
* Bad, because Requires distributed communication for cross-domain queries

## Links and Primary Sources

### Internal Platform Links
* [ADR-0022: Expand-Contract Schema Evolution for Zero Downtime](0022-expand-contract-database-migrations.md)

### Canonical Primary Sources
* [Database-per-service Pattern](https://microservices.io/patterns/data/database-per-service.html)

