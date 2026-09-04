# ADR-0018: gRPC Protocol Buffers for Low-Latency Internal RPC

* Status: accepted
* Deciders: Core Systems WG, API Governance Guild
* Date: 2024-08-28
Technical Story: PLAT-225
* Category: API Design
* Extends: ADR-0010

## Context and Problem Statement

Synchronous internal microservice communication relied entirely on JSON over HTTP/1.1. In high-frequency checkout and fraud evaluation paths, JSON serialization/deserialization CPU overhead and HTTP/1.1 head-of-line blocking introduced severe tail latency spikes (P99 exceeding 350ms) across cascading service call graphs.

## Decision Drivers

* Low-latency, high-throughput binary serialization with minimal CPU footprint
* Multiplexed bidirectional streaming and request cancellation over HTTP/2
* Strict, type-safe schema definitions with automated polyglot client generation

## Considered Options

* Option 1: gRPC with Protocol Buffers v3 for internal east-west RPC
* Option 2: Continue HTTP/1.1 REST JSON with optimized parser libraries

## Decision Outcome

Chosen option: "gRPC with Protocol Buffers v3 for internal east-west RPC", because Extends ADR-0010. Internal east-west service communication requires binary efficiency and strict type boundaries, while public north-south APIs remain standardized on OpenAPI REST.

### Positive Consequences

* P99 internal service latency dropped from 350ms to under 45ms across core checkout call graphs.
* Compute CPU utilization allocated to JSON parsing dropped by 28% across the cluster.
* Strict Protocol Buffer backwards-compatibility rules prevent accidental field numbering collisions.

### Negative Consequences

* Debugging requires specialized CLI tools like grpcurl instead of standard curl.
* Sidecar Envoy proxies must be configured for HTTP/2 and gRPC keep-alive timeouts.

## Pros and Cons of the Options

### Option 1: gRPC with Protocol Buffers v3 for internal east-west RPC

Define service contracts in .proto files, compiling strongly typed clients and server stubs across Go, Node.js, and Java services while preserving HTTP REST for external north-south clients.

* Good, because Up to 7x faster serialization and 30% smaller payload sizes compared to JSON
* Good, because Native multiplexing over single TCP connection via HTTP/2
* Good, because Built-in support for request deadlines, cancellations, and metadata propagation
* Bad, because Binary payloads cannot be inspected using standard curl or plain web browsers without reflection tools
* Bad, because Load balancers must support L7 HTTP/2 stream multiplexing

### Option 2: Continue HTTP/1.1 REST JSON with optimized parser libraries

Optimize existing REST controllers using fast JSON serializer libraries (e.g., fast-json-stringify).

* Good, because Retains human-readable text payloads and existing HTTP debugging tools
* Bad, because Fails to solve HTTP/1.1 connection pooling bottlenecks and socket exhaustion under high concurrency

## Links and Primary Sources

### Internal Platform Links
* [ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy](0007-service-mesh-mtls-and-traffic-policy.md)
* [ADR-0010: HTTP REST with OpenAPI Specification Contracts](0010-http-rest-openapi-contracts.md)

### Canonical Primary Sources
* [gRPC Core Concepts and Architecture](https://grpc.io/docs/what-is-grpc/core-concepts/)

