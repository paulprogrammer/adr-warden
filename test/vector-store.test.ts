import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStore } from '../src/vector-store.js';
import { cosineSimilarity } from '../src/embedding.js';
import type { AdrDocument, VectorChunk } from '../src/types.js';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

describe('VectorStore and Similarity Calculations', () => {
  const testIndexPath = join(__dirname, '.tmp-vector-test-index.json');

  afterEach(() => {
    if (existsSync(testIndexPath)) {
      rmSync(testIndexPath, { force: true });
    }
  });

  it('calculates deterministic cosine similarity', () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];
    const v4 = [-1, 0, 0];

    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0, 5);
    expect(cosineSimilarity(v1, v4)).toBeCloseTo(-1.0, 5);
  });

  it('indexes documents and performs top-K search', () => {
    const store = new VectorStore();

    const mockDoc1: AdrDocument = {
      id: '0001',
      filePath: '/mock/0001.md',
      relativePath: '0001.md',
      contentHash: 'hash1',
      mtime: 1000,
      metadata: { id: '0001', title: 'Runtime Config', status: 'accepted' },
      sections: { context: 'Config divergence', decision: 'Use parameter store' },
      rawContent: '...',
      summaryText: 'Runtime Config: Use parameter store',
    };

    const chunks1: VectorChunk[] = [
      {
        chunkId: '0001#summary',
        docId: '0001',
        sectionType: 'summary',
        text: 'Runtime Config: Use parameter store',
        embedding: [0.9, 0.1, 0.0],
      },
    ];

    const mockDoc2: AdrDocument = {
      id: '0002',
      filePath: '/mock/0002.md',
      relativePath: '0002.md',
      contentHash: 'hash2',
      mtime: 1000,
      metadata: { id: '0002', title: 'Immutable Digest Promotion', status: 'proposed' },
      sections: { context: 'Mutable tags', decision: 'Promote by digest' },
      rawContent: '...',
      summaryText: 'Immutable Digest: Promote by digest',
    };

    const chunks2: VectorChunk[] = [
      {
        chunkId: '0002#summary',
        docId: '0002',
        sectionType: 'summary',
        text: 'Immutable Digest: Promote by digest',
        embedding: [0.0, 0.9, 0.1],
      },
    ];

    store.addDocument(mockDoc1, chunks1);
    store.addDocument(mockDoc2, chunks2);

    expect(store.getDocumentCount()).toBe(2);
    expect(store.getChunkCount()).toBe(2);

    // Query close to doc 1
    const results1 = store.search([0.95, 0.05, 0.0], { topK: 1 });
    expect(results1.length).toBe(1);
    expect(results1[0].id).toBe('0001');
    expect(results1[0].score).toBeGreaterThan(0.9);

    // Query with status filter
    const resultsFiltered = store.search([0.95, 0.05, 0.0], {
      statusFilter: ['proposed'],
    });
    // Doc 1 is accepted, doc 2 is proposed
    expect(resultsFiltered.every((r) => r.status === 'proposed')).toBe(true);
  });

  it('persists and reloads from disk file', () => {
    const store = new VectorStore();
    const mockDoc: AdrDocument = {
      id: '0005',
      filePath: '/mock/0005.md',
      relativePath: '0005.md',
      contentHash: 'hash5',
      mtime: 1000,
      metadata: { id: '0005', title: 'Shift Left QA', status: 'accepted' },
      sections: { context: 'Late stage defects', decision: 'Enforce pre-merge gates' },
      rawContent: '...',
      summaryText: 'Shift Left QA: Enforce pre-merge gates',
    };

    store.addDocument(mockDoc, [
      {
        chunkId: '0005#summary',
        docId: '0005',
        sectionType: 'summary',
        text: 'Shift Left QA',
        embedding: [0.5, 0.5, 0.5],
      },
    ]);

    store.saveToFile(testIndexPath);
    expect(existsSync(testIndexPath)).toBe(true);

    const reloadedStore = new VectorStore();
    const loaded = reloadedStore.loadFromFile(testIndexPath);
    expect(loaded).toBe(true);
    expect(reloadedStore.getDocumentCount()).toBe(1);
    expect(reloadedStore.getDocument('0005')?.metadata.title).toBe('Shift Left QA');
  });
});
