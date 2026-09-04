# ADR-0028: Edge Caching and Global Content Delivery Network

* Status: accepted
* Deciders: Edge Architecture WG, Web Performance Guild
* Date: 2025-01-08
Technical Story: PLAT-292
* Category: Edge and Performance
* Extends: ADR-0014

## Context and Problem Statement

International users experienced high latency (exceeding 800ms) when fetching static web bundles, media assets, and localized pricing matrices directly from single-region origin clusters. Origin web gateways suffered heavy bandwidth egress costs serving repetitive static assets.

## Decision Drivers

* Deliver static assets and cacheable API payloads with sub-50ms latency globally
* Offload repetitive GET requests from origin ingress gateways
* Automated tag-based cache purging (Surrogate-Keys) during continuous deployments

## Considered Options

* Option 1: Cloudflare Global CDN with Cache-Tag Invalidation
* Option 2: Direct Origin Ingress Serving with In-Cluster Nginx Caching

## Decision Outcome

Chosen option: "Cloudflare Global CDN with Cache-Tag Invalidation", because Extends ADR-0014. Edge caching dramatically flattens global latency curves and insulates origin infrastructure from massive volumetric traffic spikes.

### Positive Consequences

* Global median P95 page load time decreased from 780ms to 120ms.
* Origin cluster network egress bandwidth costs decreased by 68%.
* Automated CI deployment hooks purge relevant Cache-Tags atomically during releases.

### Negative Consequences

* Developers must strictly set Cache-Control headers (private vs public, s-maxage) on all HTTP responses.
* Testing edge routing rules requires staging environments with custom CDN host headers.

## Pros and Cons of the Options

### Option 1: Cloudflare Global CDN with Cache-Tag Invalidation

Route public DNS through Cloudflare edge anycast networks, caching immutable static assets (versioned with content hashes) for one year and dynamic API responses with explicit Cache-Control and Surrogate-Key headers invalidated via webhooks.

* Good, because Over 300 global edge points of presence bringing content close to end users
* Good, because Reduces origin bandwidth egress costs by over 70%
* Good, because Built-in DDoS mitigation and edge TLS termination
* Bad, because Third-party dependency on edge network availability
* Bad, because Risk of users seeing stale content if cache purge signals fail

### Option 2: Direct Origin Ingress Serving with In-Cluster Nginx Caching

Serve all static and dynamic traffic directly from origin Kubernetes clusters.

* Good, because Immediate cache invalidation control within local clusters
* Bad, because Severe latency penalties for international users across oceans
* Bad, because Massive cloud egress bandwidth billing costs

## Links and Primary Sources

### Internal Platform Links
* [ADR-0014: Edge API Gateway Rate Limiting and WAF Policy](0014-rate-limiting-and-api-gateway-enforcement.md)
* [ADR-0021: Distributed Read-Through Query Caching via Redis](0021-read-heavy-query-caching-redis.md)

### Canonical Primary Sources
* [RFC 9211: The Cache-Status HTTP Response Header Field](https://datatracker.ietf.org/doc/html/rfc9211)

