# ADR-0014: Edge API Gateway Rate Limiting and WAF Policy

* Status: accepted
* Deciders: Security Architecture WG, Platform Operations
* Date: 2024-07-03
Technical Story: PLAT-195
* Category: Edge and Security
* Required by: ADR-0028
* Extends: ADR-0010

## Context and Problem Statement

Public-facing REST endpoints were subjected to credential stuffing attacks, aggressive scraping bots, and unintentional rogue API client infinite loops that overwhelmed backend database connection pools and degraded availability for legitimate users.

## Decision Drivers

* Protect backend services from denial-of-service and brute-force traffic spikes
* Enforce fair-use quotas and rate limits tiered by client tier (anonymous, authenticated, partner)
* Terminate TLS and inspect malicious payloads at the network perimeter

## Considered Options

* Option 1: Distributed Token-Bucket Rate Limiting at Edge API Gateway (Kong / Envoy)
* Option 2: In-process rate limiting middleware inside application code

## Decision Outcome

Chosen option: "Distributed Token-Bucket Rate Limiting at Edge API Gateway (Kong / Envoy)", because Extends ADR-0010. Perimeter rate limiting halts abusive traffic at the network edge, preserving internal cluster capacity and ensuring uniform policy enforcement across all microservices.

### Positive Consequences

* Shielded backend databases from connection exhaustion during bot attacks.
* Standardized RateLimit-* response headers improve partner client integration transparency.
* Decreased cloud compute egress costs by dropping unauthorized traffic at the border.

### Negative Consequences

* The edge gateway and its backing Redis tier become critical paths requiring active multi-zone redundancy.
* API contract tests must verify client behavior under 429 response conditions.

## Pros and Cons of the Options

### Option 1: Distributed Token-Bucket Rate Limiting at Edge API Gateway (Kong / Envoy)

Enforce rate limits at the perimeter gateway using a shared Redis cluster to track client token buckets based on IP, API key, or JWT client ID.

* Good, because Rejects malicious traffic before it consumes internal cluster network and compute resources
* Good, because Consistent HTTP 429 Too Many Requests response headers across all APIs
* Good, because Configurable sliding window and burst quotas per route
* Bad, because Requires low-latency edge Redis cluster
* Bad, because Misconfigured limits can accidentally throttle legitimate bursts

### Option 2: In-process rate limiting middleware inside application code

Implement token bucket filters within application middleware.

* Good, because Fine-grained access to internal domain models for rate calculation
* Bad, because Backend pods still spend CPU/memory accepting and parsing abusive requests
* Bad, because State synchronization across autoscaled pods is inaccurate or slow

## Links and Primary Sources

### Internal Platform Links
* [ADR-0010: HTTP REST with OpenAPI Specification Contracts](0010-http-rest-openapi-contracts.md)
* [ADR-0028: Edge Caching and Global Content Delivery Network](0028-edge-caching-and-global-cdn-delivery.md)

### Canonical Primary Sources
* [IETF RFC 6585: Additional HTTP Status Codes (429)](https://datatracker.ietf.org/doc/html/rfc6585)

