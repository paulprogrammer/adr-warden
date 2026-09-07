import { describe, it, expect } from 'vitest';
import { parseAdrMarkdown, createChunks } from '../src/parser.js';
import { resolve } from 'node:path';

describe('ADR Parser', () => {
  it('parses target-state MADR format (0001)', () => {
    const filePath = resolve(
      __dirname,
      '../docs/adr/0001-static-file-runtime-configuration.md'
    );
    const doc = parseAdrMarkdown(filePath);

    expect(doc.id).toBe('0001');
    expect(doc.metadata.title).toContain('Runtime Configuration Management Strategy');
    expect(doc.metadata.status).toBe('proposed');
    expect(doc.metadata.date).toBe('2026-09-03');
    expect(doc.metadata.deciders?.length).toBeGreaterThan(0);
    expect(doc.sections.context).toContain('Configuration divergence and ad-hoc variable management');
    expect(doc.sections.decisionDrivers).toContain('Deterministic Deployments');
    expect(doc.sections.consideredOptions).toContain('Option 4: Hybrid Layered Architecture');
    expect(doc.contentHash).toBeDefined();

    const chunks = createChunks(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const summaryChunk = chunks.find((c) => c.sectionType === 'summary');
    expect(summaryChunk).toBeDefined();
    expect(summaryChunk?.text).toContain('ADR 0001');
  });

  it('parses legacy ADR format (ADR-001)', () => {
    const filePath = resolve(
      __dirname,
      '../docs/adr/0001-static-file-runtime-configuration.md'
    );
    const doc = parseAdrMarkdown(filePath);

    expect(doc.id).toBe('001');
    expect(doc.metadata.title).toContain('Define deployment configuration systems of record');
    expect(doc.metadata.status).toBe('proposed');
    expect(doc.metadata.date).toBe('2026-08-27');
    expect(doc.metadata.category).toBe('Foundation');
    expect(doc.sections.context).toContain('Deployment information currently exists across Google Cloud runtime configuration');
    expect(doc.sections.decision).toContain('Git-hosted `.google` configuration and Helm artifacts are authoritative');
  });

  it('parses mock raw markdown with overrides', () => {
    const raw = `# ADR-0099: Micro-frontend isolation boundary

* Status: accepted
* Date: 2026-09-04
* Deciders: Web Architecture, Core Platform

## Context and Problem Statement
Frontend applications require sandboxed runtime execution to avoid collision.

## Decision Outcome
Use Web Components and Shadow DOM boundaries.
`;
    const doc = parseAdrMarkdown('/fake/path/0099-micro-frontends.md', undefined, raw);

    expect(doc.id).toBe('0099');
    expect(doc.metadata.title).toBe('Micro-frontend isolation boundary');
    expect(doc.metadata.status).toBe('accepted');
    expect(doc.metadata.date).toBe('2026-09-04');
    expect(doc.sections.context).toContain('Frontend applications require sandboxed runtime execution');
    expect(doc.sections.decision).toContain('Use Web Components and Shadow DOM');
  });

  it('extracts technical entities, acronyms, and citations from ADR content', () => {
    const raw = `# ADR-0050: Distributed Tracing with OpenTelemetry on GKE
* Status: accepted
## Context
We need to monitor \`gRPC\` latency and Postgres database connections according to ADR-0014 and CAF standards.
## Decision
Deploy OpenTelemetry collector DaemonSet to GKE and route to Google Cloud.
`;
    const doc = parseAdrMarkdown('/fake/path/0050-tracing.md', undefined, raw);
    expect(doc.entities).toBeDefined();
    expect(doc.entities).toContain('opentelemetry');
    expect(doc.entities).toContain('gke');
    expect(doc.entities).toContain('grpc');
    expect(doc.entities).toContain('postgres');
    expect(doc.entities).toContain('caf');
    expect(doc.entities).toContain('adr-0014');
  });
});
