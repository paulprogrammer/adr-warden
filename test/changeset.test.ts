import { describe, it, expect } from 'vitest';
import { ChangesetParser } from '../src/changeset.js';
import { ChangesetAligner } from '../src/align.js';
import { VectorStore } from '../src/vector-store.js';
import { GitHubRemoteResolver } from '../src/remote/providers/github.js';
import type { AdrDocument } from '../src/types.js';

describe('Changeset Analysis & ADR Alignment', () => {
  const sampleDiff = `diff --git a/package.json b/package.json
index 1234567..89abcdef 100644
--- a/package.json
+++ b/package.json
@@ -15,2 +15,4 @@
     "express": "^4.18.2",
+    "ioredis": "^5.3.2",
+    "jsonwebtoken": "^9.0.2"
   }
diff --git a/src/cache/redis-store.ts b/src/cache/redis-store.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/cache/redis-store.ts
@@ -0,0 +1,15 @@
+import Redis from 'ioredis';
+
+export class RedisCacheManager {
+  private client: Redis;
+  constructor() {
+    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
+  }
+}
+`;

  it('parses unified diff and extracts modified files, dependencies, and domain keywords', () => {
    const parsed = ChangesetParser.parseDiff(sampleDiff);

    expect(parsed.files.length).toBe(2);
    expect(parsed.files[0].path).toBe('package.json');
    expect(parsed.files[1].path).toBe('src/cache/redis-store.ts');
    expect(parsed.files[1].changeType).toBe('added');

    // Dependencies
    expect(parsed.touchedDependencies.length).toBe(2);
    expect(parsed.touchedDependencies.some((d) => d.name === 'ioredis')).toBe(true);
    expect(parsed.touchedDependencies.some((d) => d.name === 'jsonwebtoken')).toBe(true);

    // Keywords
    expect(parsed.extractedKeywords).toContain('ioredis');
    expect(parsed.extractedKeywords).toContain('redis');
    expect(parsed.extractedKeywords).toContain('cache');
  });

  it('classifies matches into binding standards vs in-flight proposals', async () => {
    const parsed = ChangesetParser.parseDiff(sampleDiff);

    // Create a mock engine that has sparse BM25 and document store
    const store = new VectorStore();

    const adrAccepted: AdrDocument = {
      id: '0003',
      filePath: 'docs/adr/0003-redis-distributed-caching.md',
      contentHash: 'hash3',
      rawContent: '# ADR 0003: Redis distributed caching',
      sections: {
        title: 'Redis distributed caching',
        status: 'accepted',
        context: 'We require low-latency caching and distributed locking across microservices.',
        decision: 'Adopt Redis with connection clustering. Mandate ioredis client across all Node.js services.',
      },
      metadata: {
        id: '0003',
        title: 'Redis distributed caching',
        status: 'accepted',
      },
    };

    const adrProposed: AdrDocument = {
      id: '0009',
      filePath: 'docs/adr/0009-centralized-session-token-standard.md',
      contentHash: 'hash9',
      rawContent: '# ADR 0009: Centralized Session Token Standard',
      sections: {
        title: 'Centralized Session Token Standard',
        status: 'proposed',
        context: 'Session verification requires JWT tokens signed with RS256.',
        decision: 'Use jsonwebtoken with asymmetric RS256 key pairs for authorization.',
      },
      metadata: {
        id: '0009',
        title: 'Centralized Session Token Standard',
        status: 'proposed',
      },
    };

    store.addDocument(adrAccepted, [
      {
        chunkId: '0003-dec',
        docId: '0003',
        sectionType: 'decision',
        text: adrAccepted.sections.decision,
      },
    ]);

    store.addDocument(adrProposed, [
      {
        chunkId: '0009-dec',
        docId: '0009',
        sectionType: 'decision',
        text: adrProposed.sections.decision,
      },
    ]);

    const mockEngine: any = {
      getVectorStore: () => store,
      getKnowledgeGraph: () => ({
        getLineage: () => ({ activeStandardId: '0003', isActive: true }),
      }),
      search: async (q: string, opts: any) => {
        return store.search([], { ...opts, mode: 'sparse', queryText: q });
      },
    };

    const resolver = new GitHubRemoteResolver({
      provider: 'github',
      owner: 'my-corp',
      repository: 'platform-arch',
      branch: 'main',
      baseDir: 'docs/adr',
    });

    const report = await ChangesetAligner.evaluate(parsed, mockEngine, {
      threshold: 0.1,
      resolver,
    });

    expect(report.targetChangeset.filesCount).toBe(2);
    expect(report.targetChangeset.dependenciesCount).toBe(2);

    // Binding standard (0003 accepted)
    expect(report.bindingStandards.length).toBeGreaterThanOrEqual(1);
    const redisMatch = report.bindingStandards.find((m) => m.adrId === '0003');
    expect(redisMatch).toBeDefined();
    expect(redisMatch?.title).toBe('Redis distributed caching');
    expect(redisMatch?.webUrl).toBe(
      'https://github.com/my-corp/platform-arch/blob/main/docs/adr/0003-redis-distributed-caching.md'
    );
    expect(redisMatch?.observations[0]).toContain('Mandatory architectural baseline');

    // In-flight proposal (0009 proposed)
    expect(report.inFlightProposals.length).toBeGreaterThanOrEqual(1);
    const jwtMatch = report.inFlightProposals.find((m) => m.adrId === '0009');
    expect(jwtMatch).toBeDefined();
    expect(jwtMatch?.title).toBe('Centralized Session Token Standard');
    expect(jwtMatch?.webUrl).toBe(
      'https://github.com/my-corp/platform-arch/blob/main/docs/adr/0009-centralized-session-token-standard.md'
    );
    expect(jwtMatch?.observations[0]).toContain('Pending architectural proposal');
  });
});
