# ADR-0006: Batch Cron-Based Data Synchronization Between Services

* Status: superseded by [ADR-0019](0019-event-driven-streaming-architecture-kafka.md)
* Deciders: Data Platform WG, Operations Lead
* Date: 2024-03-15
Technical Story: PLAT-135
* Category: Data Integration
* Superseded by: ADR-0019

## Context and Problem Statement

Downstream analytics, inventory reconciliation, and billing services required data produced by the primary order management system. To avoid coupling transactional services with direct synchronous HTTP calls, an initial cron-based nightly batch export was implemented to extract database dumps, transform them into CSV files, and upload them to cloud storage buckets.

## Decision Drivers

* Simple point-to-point batch execution using standard SQL queries
* Zero real-time coordination between engineering teams
* Low initial operational infrastructure requirement

## Considered Options

* Option 1: Nightly batch extraction jobs via scheduled cron containers
* Option 2: Immediate event streaming across message bus

## Decision Outcome

Chosen option: "Nightly batch extraction jobs via scheduled cron containers", because Allowed initial feature delivery within tight timelines before the platform established enterprise streaming infrastructure.

### Positive Consequences

* Rapid time-to-market for early downstream reporting systems.
* Transactional databases were shielded from daytime analytical query loads.

### Negative Consequences

* Business operations were hamstrung by 24-hour data latency.
* Batch processing bottlenecks caused cascading delays when daily transaction volumes spiked.

## Pros and Cons of the Options

### Option 1: Nightly batch extraction jobs via scheduled cron containers

Run SQL select queries against read-replicas every night and write bulk files to storage.

* Good, because Straightforward implementation using existing relational databases
* Good, because Predictable off-peak database load
* Bad, because Data staleness of up to 24 hours
* Bad, because Massive batch job execution windows vulnerable to mid-stream failures requiring full re-runs

### Option 2: Immediate event streaming across message bus

Stream domain events asynchronously as state transitions occur.

* Good, because Near real-time data propagation
* Good, because Fine-grained failure isolation per message
* Bad, because Higher architectural complexity requiring dedicated streaming brokers and schema governance

## Links and Primary Sources

### Internal Platform Links
* [ADR-0019: Asynchronous Event Streaming Architecture via Kafka](0019-event-driven-streaming-architecture-kafka.md)

### Canonical Primary Sources
* [Designing Data-Intensive Applications: Batch Processing](https://dataintensive.net)

