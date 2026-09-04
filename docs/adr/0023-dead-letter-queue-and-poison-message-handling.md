# ADR-0023: Dead-Letter Queue and Poison Message Processing

* Status: accepted
* Deciders: Distributed Systems WG, Data Platform WG
* Date: 2024-11-06
Technical Story: PLAT-262
* Category: Data Integration
* Extends: ADR-0019

## Context and Problem Statement

When Kafka consumer services encountered corrupt payloads, unexpected null values, or unhandled runtime exceptions, the consumer thread crashed and restarted. Upon restart, it re-read the exact same offset, triggering an infinite crash loop that stalled the entire consumer group and blocked subsequent valid messages across that partition.

## Decision Drivers

* Prevent poison pill messages from halting consumer group partition processing
* Deterministic retry policies with bounded exponential backoff and jitter
* Isolation of unprocessable messages in a durable dead-letter topic for inspection

## Considered Options

* Option 1: Retry Topic Hierarchy with Dead-Letter Queue (DLQ)
* Option 2: Fail-fast and commit offset (Drop on Error)

## Decision Outcome

Chosen option: "Retry Topic Hierarchy with Dead-Letter Queue (DLQ)", because Extends ADR-0019. Bounded retries with dead-letter isolation protect partition throughput while guaranteeing zero data loss for malformed or problematic events.

### Positive Consequences

* Poison pill messages no longer cause cascading consumer crash loops.
* SRE teams have automated alerts monitoring DLQ depth with replay tooling to re-inject remediated messages.
* Failed payloads retain original trace IDs and error stack traces in message headers.

### Negative Consequences

* Messages routed to retry queues lose strict FIFO ordering relative to non-retried messages on the same key.
* Requires consumer frameworks to standardize DLQ header formats and error routing wrappers.

## Pros and Cons of the Options

### Option 1: Retry Topic Hierarchy with Dead-Letter Queue (DLQ)

Failed messages are routed through sequential retry topics with progressive backoff delays (e.g., topic.retry.10s, topic.retry.1m, topic.retry.5m). Upon exceeding maximum retry thresholds, messages are routed to topic.dlq alongside diagnostic failure headers.

* Good, because Unblocks the primary partition immediately for downstream healthy traffic
* Good, because Transient downstream outages self-heal through scheduled retry queues
* Good, because Failed messages are preserved indefinitely with error context for administrative inspection
* Bad, because Can alter strict message processing order for records routed to retry queues
* Bad, because Increases Kafka partition and topic count management overhead

### Option 2: Fail-fast and commit offset (Drop on Error)

Log the error and commit the offset to continue processing.

* Good, because Zero additional topic infrastructure required
* Good, because Primary topic partition never stalls
* Bad, because Silent data loss: dropped financial or order events cannot be easily recovered

## Links and Primary Sources

### Internal Platform Links
* [ADR-0009: Centralized Structured JSON Logging Standards](0009-centralized-structured-json-logging.md)
* [ADR-0019: Asynchronous Event Streaming Architecture via Apache Kafka](0019-event-driven-streaming-architecture-kafka.md)

### Canonical Primary Sources
* [Uber Engineering: Reliable Reprocessing with Kafka Retry Queues](https://www.uber.com/blog/reliable-reprocessing/)

