# ADR-0009: Centralized Structured JSON Logging Standards

* Status: accepted
* Deciders: Observability Guild, Platform Architecture WG
* Date: 2024-04-24
Technical Story: PLAT-158
* Category: Observability
* Required by: ADR-0025

## Context and Problem Statement

Service logs were previously printed as unstructured multi-line strings directly to stdout or local log files. When production incidents occurred, parsing stack traces, correlating distributed call sequences, and filtering by customer or order identifiers required fragile ad-hoc grep and regex commands across log aggregation systems.

## Decision Drivers

* Machine-parseable log envelopes across all programming languages
* Contextual distributed request correlation via standardized trace and span IDs
* Compliance with data privacy controls (automatic PII masking)

## Considered Options

* Option 1: Standardized Structured JSON Logging to stdout
* Option 2: Human-readable formatted text logging

## Decision Outcome

Chosen option: "Standardized Structured JSON Logging to stdout", because At enterprise scale, log consumers are automated indexing pipelines and alerting agents, not humans reading raw terminal output. Single-line structured JSON is the industry baseline for reliable ingestion.

### Positive Consequences

* Log indexing throughput increased by 40% due to elimination of complex regex parsing.
* Incident triage MTTR decreased significantly through instant filtering by trace_id and error_code.
* Automated alerting rules evaluate structured fields with deterministic accuracy.

### Negative Consequences

* Developers must use terminal JSON formatters during local debugging.
* Log payload volume increased slightly due to explicit key names on every log line.

## Pros and Cons of the Options

### Option 1: Standardized Structured JSON Logging to stdout

Emit single-line JSON log objects to stdout containing standardized schema keys (timestamp, level, service, trace_id, message, context).

* Good, because Zero custom parsing logic needed in log shippers
* Good, because Enables high-speed indexing and filtering in centralized log stores
* Good, because Facilitates automated PII scrubber middleware
* Bad, because Harder to read raw in local terminal output without formatting CLI tools

### Option 2: Human-readable formatted text logging

Maintain traditional log formats like pattern layouts.

* Good, because Aesthetic readability during local debugging
* Bad, because Brittle regex parsing in log indexers; multi-line stack traces break ingestion chunks

## Links and Primary Sources

### Internal Platform Links
* [ADR-0005: Stateless Service Architecture and Session Externalization](0005-stateless-service-session-externalization.md)
* [ADR-0025: Distributed Tracing and OpenTelemetry Semantic Conventions](0025-opentelemetry-distributed-tracing-standards.md)

### Canonical Primary Sources
* [OpenTelemetry Logging Specification](https://opentelemetry.io/docs/specs/otel/logs/)

