# ADR-0019: Asynchronous Event Streaming Architecture via Apache Kafka

* Status: accepted
* Deciders: Data Platform WG, Distributed Systems Architecture
* Date: 2024-09-11
Technical Story: PLAT-232
* Category: Data Integration
* Supersedes: ADR-0006
* Required by: ADR-0020, ADR-0023

## Context and Problem Statement

As identified in ADR-0006, nightly batch ETL cron synchronization led to severe operational delays, data staleness, and database query contention. Services required immediate, durable, decoupled notification of state transitions (orders created, payments processed, inventory decremented) to power real-time analytics, notifications, and downstream workflows.

## Decision Drivers

* Decoupled asynchronous event distribution with high write throughput
* Durable, replayable distributed commit log preserving event order by partition key
* Schema evolution governance preventing corrupt payloads across consumers

## Considered Options

* Option 1: Apache Kafka Distributed Log with Confluent Schema Registry
* Option 2: Traditional AMQP Message Broker (RabbitMQ)

## Decision Outcome

Chosen option: "Apache Kafka Distributed Log with Confluent Schema Registry", because Supersedes ADR-0006. The immutable, replayable distributed log model decouples producers from consumers completely, turning the event stream into a verifiable real-time nervous system for the platform.

### Positive Consequences

* Data propagation latency dropped from 24 hours to under 200 milliseconds.
* New services can be onboarded and backfilled by rewinding consumer offsets to the beginning of topics.
* Producers and consumers can deploy independently without direct network coupling.

### Negative Consequences

* Requires dedicated platform team expertise to manage Kafka cluster health, partition sizing, and compaction.
* Developers must account for eventual consistency and out-of-order delivery across different partition keys.

### Architecture Topology

```mermaid
graph LR
    P[Order Service (Producer)] -->|Avro Event| SR[Schema Registry]
    P -->|Partition Key: order_id| K[Kafka Topic: orders.events]
    K -->|Offset Stream| C1[Billing Service (Consumer Group 1)]
    K -->|Offset Stream| C2[Inventory Service (Consumer Group 2)]
    K -->|Offset Stream| C3[Analytics Ingestion (Consumer Group 3)]
```

## Pros and Cons of the Options

### Option 1: Apache Kafka Distributed Log with Confluent Schema Registry

Publish domain events to partitioned Kafka topics using Apache Avro schemas registered in a central schema registry with strict backward compatibility enforcement.

* Good, because Massive throughput capability exceeding 100k events/second with sub-10ms latency
* Good, because Durable, replayable event log enables downstream consumers to rewind and reprocess history
* Good, because Schema Registry guarantees producers cannot publish breaking payload formats
* Bad, because Substantial operational overhead managing Kafka broker clusters and ZooKeeper/KRaft quorum
* Bad, because Requires careful partition key selection to avoid consumer hot-spotting

### Option 2: Traditional AMQP Message Broker (RabbitMQ)

Publish messages to RabbitMQ exchanges routed to individual consumer queues.

* Good, because Flexible queue routing and consumer acknowledgments
* Good, because Simpler operational footprint for small workloads
* Bad, because Messages are deleted upon consumption; cannot rewind or replay historical event streams
* Bad, because Scales poorly under high-volume streaming telemetry workloads

## Links and Primary Sources

### Internal Platform Links
* [ADR-0006: Batch Cron-Based Data Synchronization Between Services](0006-batch-cron-data-synchronization.md)
* [ADR-0020: Distributed Saga Pattern for Cross-Service Coordination](0020-distributed-saga-pattern-coordination.md)
* [ADR-0023: Dead-Letter Queue and Poison Message Processing](0023-dead-letter-queue-and-poison-message-handling.md)

### Canonical Primary Sources
* [Apache Kafka Design Principles](https://kafka.apache.org/documentation/#design)

