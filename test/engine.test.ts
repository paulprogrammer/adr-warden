import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AdrEngine } from '../src/engine.js';
import { resolve, join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

describe('AdrEngine Integration & Overlap Analysis', () => {
  const testCacheDir = join(__dirname, '.test-engine-cache');
  let engine: AdrEngine;
  const docsAdrDir = resolve(__dirname, '../docs/adr');

  beforeAll(async () => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
    engine = new AdrEngine({ cacheDir: testCacheDir, autoSave: false });

    // Index the actual ADRs in target repo
    const stats = await engine.indexDirectories([docsAdrDir]);
    expect(stats.totalFiles).toBeGreaterThanOrEqual(10);
    expect(stats.indexedFiles).toBeGreaterThanOrEqual(10);
  }, 60000);

  afterAll(() => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('performs semantic search for secret management and configuration', async () => {
    const results = await engine.search('how to manage runtime configuration and secrets outside git', {
      topK: 3,
    });

    expect(results.length).toBeGreaterThan(0);
    // ADR-0001 or ADR-0009 should be in the top results
    const topIds = results.map((r) => r.id);
    expect(topIds).toContain('0001');
    expect(results[0].score).toBeGreaterThan(0.5);
  });

  it('flags near-duplicate draft as DUPLICATE_RISK', async () => {
    const draft = {
      title: 'Runtime Configuration and Variable Management Architecture',
      context: 'Application configuration is currently fragmented across Azure DevOps pipeline variables and runtime settings, causing divergence and deployment drift.',
      decision: 'Implement a hybrid layered configuration model combining Git overlays for static topology with an abstracted managed parameter store and Google Secret Manager.',
    };

    const analysis = await engine.checkOverlap(draft);
    expect(analysis.topMatches[0].adrId).toBe('0001');
    expect(analysis.topMatches[0].verdict).toBe('DUPLICATE_RISK');
    expect(analysis.actionableGuidance.some((g) => g.includes('HALT'))).toBe(true);
  });

  it('flags divergent decision as CONFLICT_RISK or related prior art', async () => {
    const draft = {
      title: 'Distributed Configuration Management with Self-Hosted Consul',
      context: 'Configuration divergence and ad-hoc variable management are primary sources of release instability. Application configurations are scattered across pipeline variables.',
      decision: 'Deploy and operate self-hosted HashiCorp Consul clusters on GKE to maintain key-value parameter configuration.',
    };

    const analysis = await engine.checkOverlap(draft);
    // ADR-0001 evaluates Consul under considered options and rejects self-hosted clusters
    const match0001 = analysis.topMatches.find((m) => m.adrId === '0001');
    expect(match0001).toBeDefined();
    expect(match0001?.contextSimilarity).toBeGreaterThan(0.60);
    expect(analysis.topMatches.length).toBeGreaterThan(0);
  });

  it('identifies orthogonal/novel proposals as NOVEL', async () => {
    const draft = {
      title: 'Satellite-to-Ground Optical Quantum Entanglement Communication',
      context: 'Long distance telemetry communication through atmospheric interference requires post-quantum cryptography links.',
      decision: 'Deploy orbital satellite repeaters with entangled photon sensors.',
    };

    const analysis = await engine.checkOverlap(draft);
    expect(analysis.verdict).toBe('NOVEL');
    expect(analysis.confidence).toBeLessThan(0.65);
  });

  it('retrieves ADR by ID and lists ADR catalog', () => {
    const adr = engine.getAdr('0001');
    expect(adr).toBeDefined();
    expect(adr?.metadata.title).toContain('Runtime Configuration');

    const all = engine.listAdrs();
    expect(all.length).toBeGreaterThanOrEqual(10);
  });
});
