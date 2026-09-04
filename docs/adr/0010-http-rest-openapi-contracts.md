# ADR-0010: HTTP REST with OpenAPI Specification Contracts

* Status: accepted
* Deciders: API Governance Guild, Architecture Review Board
* Date: 2024-05-08
Technical Story: PLAT-165
* Category: API Design
* Required by: ADR-0014, ADR-0018, ADR-0024

## Context and Problem Statement

Public and partner APIs suffered from undocumented endpoints, inconsistent pagination parameters, unversioned breaking response changes, and lagging hand-written client documentation. Integration teams lost significant velocity attempting to discover payload schemas through trial-and-error network inspections.

## Decision Drivers

* Machine-readable, single source of truth for all public and internal REST interfaces
* Automated client SDK and mock server generation in developer environments
* Automated CI schema linting and backward-compatibility verification

## Considered Options

* Option 1: OpenAPI 3.1 Contract-First Specification
* Option 2: Code-First Schema Generation

## Decision Outcome

Chosen option: "OpenAPI 3.1 Contract-First Specification", because API contracts are long-term commitments. Contract-first design forces teams to think critically about resource modeling, idempotency, and error envelopes before committing code.

### Positive Consequences

* Interactive documentation is continuously up-to-date in developer portals.
* Automated CI linters block pull requests that introduce breaking changes without proper versioning.
* Frontend and backend teams can develop in parallel against mock servers generated from the contract.

### Negative Consequences

* Adds an upfront design review phase to API development cycles.
* Requires maintaining OpenAPI linting rulesets across all service repositories.

## Pros and Cons of the Options

### Option 1: OpenAPI 3.1 Contract-First Specification

Define API schemas in OpenAPI 3.1 YAML contracts prior to writing code, validating requests and responses via automated middleware.

* Good, because Strict structural validation against JSON Schema 2020-12
* Good, because Vibrant tooling ecosystem for documentation, mocks, and SDK generation
* Good, because Enables automated breaking change detection in CI pull requests
* Bad, because Requires contract governance discipline before writing business logic
* Bad, because Learning curve for developers unfamiliar with OpenAPI specifications

### Option 2: Code-First Schema Generation

Write application routes and generate documentation dynamically from code reflections.

* Good, because Faster initial prototyping for developers
* Bad, because Documentation frequently drifts from intended business models
* Bad, because Schema evolution is obscured by code refactoring

## Links and Primary Sources

### Internal Platform Links
* [ADR-0014: Edge API Gateway Rate Limiting and WAF Policy](0014-rate-limiting-and-api-gateway-enforcement.md)
* [ADR-0018: gRPC Protocol Buffers for Low-Latency Internal RPC](0018-grpc-protocol-buffers-internal-rpc.md)
* [ADR-0024: Idempotent API Request Processing with Distributed Locks](0024-idempotent-api-request-handling.md)

### Canonical Primary Sources
* [OpenAPI Specification v3.1.0](https://spec.openapis.org/oas/v3.1.0)

