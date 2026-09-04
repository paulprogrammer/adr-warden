# ADR-0025: Distributed Tracing and OpenTelemetry Semantic Conventions

* Status: accepted
* Deciders: Observability Guild, Site Reliability Engineering
* Date: 2024-12-04
Technical Story: PLAT-278
* Category: Observability
* Depends on: ADR-0007
* Extends: ADR-0009

## Context and Problem Statement

As the platform grew to over 40 interconnected microservices, diagnosing latency bottlenecks, inter-service timeouts, and cascading failure cascades was virtually impossible using isolated logs alone. Engineers lacked end-to-end visibility into the distributed call graphs traversed by single user transactions.

## Decision Drivers

* Vendor-agnostic distributed telemetry instrumentation across polyglot services
* Automated context propagation over HTTP, gRPC, and Kafka using W3C TraceContext standards
* Deterministic semantic conventions for database queries, external API calls, and errors

## Considered Options

* Option 1: OpenTelemetry SDK Integration with Central OTel Collector Tier
* Option 2: Proprietary Commercial APM Agent Injection

## Decision Outcome

Chosen option: "OpenTelemetry SDK Integration with Central OTel Collector Tier", because Extends ADR-0009 and depends on ADR-0007. OpenTelemetry is the canonical open standard for distributed systems observability. In-process SDKs combined with tail-sampling collector tiers provide deep architectural visibility without proprietary vendor capture.

### Positive Consequences

* MTTR for cross-service latency regressions decreased by 65%.
* Engineers can inspect complete call graphs including database queries and Kafka lag directly in trace UIs.
* Log records now embed valid trace_id and span_id fields, enabling seamless jump-from-log-to-trace workflows.

### Negative Consequences

* Platform team must operate an autoscaled OTel Collector tier and underlying trace storage.
* All internal RPC and message producers must strictly forward W3C TraceContext headers.

## Pros and Cons of the Options

### Option 1: OpenTelemetry SDK Integration with Central OTel Collector Tier

Instrument services with OpenTelemetry SDKs, propagating traceparent headers across HTTP/gRPC/Kafka boundaries. Traces are exported via OTLP gRPC to an autoscaled OpenTelemetry Collector pool that routes spans to Jaeger/Tempo storage.

* Good, because Zero vendor lock-in; standardized open industry specification
* Good, because Unified correlation connecting traces, structured logs (ADR-0009), and metrics
* Good, because Tail-based sampling at the collector tier discards uninteresting 200 OK spans while retaining 100% of errors
* Bad, because Tracing overhead adds 0.5-1ms CPU and network payload latency
* Bad, because High telemetry storage volumes requiring strict retention policies

### Option 2: Proprietary Commercial APM Agent Injection

Inject closed-source commercial agents at container runtime.

* Good, because Automated bytecode instrumentation requiring minimal code edits
* Bad, because Severe vendor lock-in and exorbitant licensing costs that scale with transaction volume
* Bad, because Opaque agent performance overhead and security review friction

## Links and Primary Sources

### Internal Platform Links
* [ADR-0007: Service Mesh Mutual TLS and Zero-Trust Traffic Policy](0007-service-mesh-mtls-and-traffic-policy.md)
* [ADR-0009: Centralized Structured JSON Logging Standards](0009-centralized-structured-json-logging.md)

### Canonical Primary Sources
* [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)

