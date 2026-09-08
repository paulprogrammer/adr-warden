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

    // Index the actual ADRs in local docs/adr directory
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
    const topIds = results.map((r) => r.id);
    expect(topIds.some((id) => ['0001', '0012', '0017'].includes(id))).toBe(true);
    expect(results[0].score).toBeGreaterThan(0.4);
  });

  it('flags near-duplicate draft as DUPLICATE_RISK', async () => {
    const draft = {
      title: 'Static File Runtime Configuration Strategy',
      context: 'Initial platform deployments relied on environment-specific JSON and YAML configuration files baked directly into machine images, causing operational friction and configuration drift.',
      decision: 'Bake static config files per environment into host machine images to achieve rapid initial bootstrap reliability.',
    };

    const analysis = await engine.checkOverlap(draft);
    expect(analysis.topMatches[0].adrId).toBe('0001');
    expect(analysis.topMatches[0].verdict).toBe('DUPLICATE_RISK');
    expect(analysis.actionableGuidance.some((g) => g.includes('HALT'))).toBe(true);
  });

  it('flags divergent decision as CONFLICT_RISK or related prior art', async () => {
    const draft = {
      title: 'Distributed Configuration Management with Self-Hosted Consul',
      context: 'Applications require hierarchical configuration merging and dynamic runtime parameter updates without restarting application pods.',
      decision: 'Deploy and operate self-hosted HashiCorp Consul clusters to maintain dynamic runtime key-value configuration.',
    };

    const analysis = await engine.checkOverlap(draft);
    const match = analysis.topMatches.find((m) => m.adrId === '0012' || m.adrId === '0001');
    expect(match).toBeDefined();
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
    expect(adr?.metadata.title).toContain('Static File Runtime Configuration');

    const all = engine.listAdrs();
    expect(all.length).toBeGreaterThanOrEqual(10);
  });
});
