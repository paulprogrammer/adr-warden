import { describe, it, expect } from 'vitest';
import { Bm25Index, tokenize } from '../src/bm25.js';

describe('Bm25Index Tokenization and Ranking', () => {
  it('tokenizes text and discards common stopwords while preserving technical tokens', () => {
    const text = 'Adopt gRPC and OpenTelemetry for ADR-0014 on GKE clusters!';
    const tokens = tokenize(text);

    expect(tokens).toContain('grpc');
    expect(tokens).toContain('opentelemetry');
    expect(tokens).toContain('adr-0014');
    expect(tokens).toContain('gke');
    expect(tokens).toContain('clusters');
    expect(tokens).not.toContain('and');
    expect(tokens).not.toContain('for');
    expect(tokens).not.toContain('on');
  });

  it('calculates higher score for rarer terms and normalizes length', () => {
    const index = new Bm25Index();

    // Doc 1 discusses Consul and general configuration
    index.addChunk('0001#summary', '0001', 'summary', 'Runtime configuration using managed parameter store and secret manager');
    index.addChunk('0001#options', '0001', 'options', 'Evaluated HashiCorp Consul cluster but rejected due to operational burden');

    // Doc 2 discusses container images and configuration parameter
    index.addChunk('0002#summary', '0002', 'summary', 'Immutable container image promotion and configuration parameter using sha256 digests');

    // Doc 3 discusses telemetry and log store
    index.addChunk('0014#summary', '0014', 'summary', 'Observability and structured logging using OpenTelemetry on Kubernetes log store');

    expect(index.getChunkCount()).toBe(4);

    // Rare term "Consul" should strongly match 0001
    const consulResults = index.search('Consul');
    expect(consulResults.length).toBe(1);
    expect(consulResults[0].docId).toBe('0001');
    expect(consulResults[0].matchedTerms).toContain('consul');

    // Attribution
    const attribution = index.attributeTerms('0001', 'Consul parameter store');
    expect(attribution.length).toBeGreaterThanOrEqual(2);
    expect(attribution[0].term).toBe('consul'); // Consul is rarer than parameter/store, thus higher weight
  });

  it('handles empty query or non-existent terms gracefully', () => {
    const index = new Bm25Index();
    index.addChunk('0001#summary', '0001', 'summary', 'Runtime configuration management');

    expect(index.search('')).toEqual([]);
    expect(index.search('nonexistenttermfortestxyz')).toEqual([]);
  });

  it('removes documents and chunks correctly', () => {
    const index = new Bm25Index();
    index.addChunk('0001#summary', '0001', 'summary', 'Runtime configuration management');
    index.addChunk('0001#decision', '0001', 'decision', 'Use managed parameter store');

    expect(index.getChunkCount()).toBe(2);

    index.removeDocument('0001');
    expect(index.getChunkCount()).toBe(0);
    expect(index.search('runtime')).toEqual([]);
  });
});
