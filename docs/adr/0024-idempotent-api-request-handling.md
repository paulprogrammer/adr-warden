# ADR-0024: Idempotent API Request Processing with Distributed Locks

* Status: accepted
* Deciders: API Governance Guild, Financial Systems WG
* Date: 2024-11-20
Technical Story: PLAT-270
* Category: API Design
* Depends on: ADR-0005
* Extends: ADR-0010

## Context and Problem Statement

Unreliable mobile networks and automatic API gateway retry policies frequently caused duplicate POST requests to be submitted for order placements and wallet fund deductions. Without deterministic idempotency guarantees, users were accidentally charged twice or duplicate inventory reservations were created.

## Decision Drivers

* Guarantee exactly-once side-effect execution for mutating HTTP POST requests
* Standardized client Idempotency-Key header semantics across all API endpoints
* Protection against concurrent race conditions during in-flight duplicate submissions

## Considered Options

* Option 1: Redis-Backed Distributed Idempotency Key Gate with Atomic Locks
* Option 2: Database Unique Constraint Matching

## Decision Outcome

Chosen option: "Redis-Backed Distributed Idempotency Key Gate with Atomic Locks", because Extends ADR-0010 and depends on ADR-0005. The IETF draft standard for Idempotency-Key provides a deterministic contract that shields downstream payment gateways from duplicate executions.

### Positive Consequences

* Completely eradicated duplicate billing and double-booking incidents across checkout flows.
* Safely allows mobile clients and gateways to retry aggressive network timeouts without fear of side effects.
* Standardized HTTP response replay adheres to IETF API specifications.

### Negative Consequences

* Clients must handle HTTP 409 Conflict if they resubmit requests while the initial execution is still in-flight.
* Increases storage requirements for response payload caching in Redis.

## Pros and Cons of the Options

### Option 1: Redis-Backed Distributed Idempotency Key Gate with Atomic Locks

Clients provide an Idempotency-Key UUID header. Middleware attempts an atomic Redis SET NX with a 120-second lease. If acquired, execution proceeds and caches the final HTTP response status and body in Redis for 24 hours. If locked, concurrent requests receive HTTP 409 or poll. If cached, the original response is replayed immediately.

* Good, because Guarantees identical responses for duplicate requests without repeating business logic
* Good, because Eliminates double charges and duplicate order creations
* Good, because Seamless integration via standardized gateway/application middleware
* Bad, because Requires Redis cluster write on every mutating request
* Bad, because Clients must generate stable UUID keys per user action

### Option 2: Database Unique Constraint Matching

Rely solely on unique database indexes (e.g., unique customer_id + order_token).

* Good, because Leverages existing database transaction guarantees without Redis
* Bad, because Throws generic database integrity errors instead of replaying valid business responses
* Bad, because Does not protect expensive upstream validation and payment gateway calls

## Links and Primary Sources

### Internal Platform Links
* [ADR-0005: Stateless Service Architecture and Session Externalization](0005-stateless-service-session-externalization.md)
* [ADR-0010: HTTP REST with OpenAPI Specification Contracts](0010-http-rest-openapi-contracts.md)

### Canonical Primary Sources
* [IETF Draft: The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)

