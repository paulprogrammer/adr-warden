import { describe, it, expect, vi } from 'vitest';
import { GitHubRemoteResolver } from '../src/remote/providers/github.js';
import { AzureDevOpsRemoteResolver } from '../src/remote/providers/azure-devops.js';
import { CustomRemoteResolver } from '../src/remote/providers/custom.js';
import { createRemoteResolver } from '../src/remote/resolver.js';
import { RemoteIndexLoader } from '../src/remote/index-loader.js';
import { resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

describe('Remote Providers & Resolvers', () => {
  it('resolves GitHub web and raw URLs properly', () => {
    const resolver = new GitHubRemoteResolver({
      provider: 'github',
      owner: 'acme-corp',
      repository: 'architecture',
      branch: 'main',
      baseDir: 'docs/adr',
    });

    const urls = resolver.resolveUrls('0005', '0005-database-sharding.md');
    expect(urls.webUrl).toBe(
      'https://github.com/acme-corp/architecture/blob/main/docs/adr/0005-database-sharding.md'
    );
    expect(urls.rawUrl).toBe(
      'https://raw.githubusercontent.com/acme-corp/architecture/main/docs/adr/0005-database-sharding.md'
    );
  });

  it('resolves Azure DevOps web and REST items URLs properly', () => {
    const resolver = new AzureDevOpsRemoteResolver({
      provider: 'azure-devops',
      organization: 'contoso-health',
      project: 'CorePlatform',
      repository: 'architecture-adrs',
      branch: 'release/v2',
      baseDir: 'standards/adrs',
    });

    const urls = resolver.resolveUrls('0012', '0012-oauth2-federation.md');
    expect(urls.webUrl).toContain('dev.azure.com/contoso-health/CorePlatform/_git/architecture-adrs');
    expect(urls.webUrl).toContain(encodeURIComponent('/standards/adrs/0012-oauth2-federation.md'));
    expect(urls.webUrl).toContain('version=GBrelease/v2');

    expect(urls.rawUrl).toContain('dev.azure.com/contoso-health/CorePlatform/_apis/git/repositories/architecture-adrs/items');
    expect(urls.rawUrl).toContain('$format=octetStream');
    expect(urls.rawUrl).toContain('api-version=6.0');
  });

  it('resolves Custom provider template URLs', () => {
    const resolver = new CustomRemoteResolver({
      provider: 'custom',
      repository: 'docs',
      webUrlTemplate: 'https://docs.internal.net/architecture/{relativePath}',
      rawUrlTemplate: 'https://s3.internal.net/adrs/{id}.md',
    });

    const urls = resolver.resolveUrls('0042', '0042-kafka-streaming.md');
    expect(urls.webUrl).toBe('https://docs.internal.net/architecture/0042-kafka-streaming.md');
    expect(urls.rawUrl).toBe('https://s3.internal.net/adrs/0042.md');
  });

  it('createRemoteResolver factory constructs correct provider instance', () => {
    const gh = createRemoteResolver({ provider: 'github', repository: 'repo', owner: 'org' });
    expect(gh.providerType).toBe('github');

    const ado = createRemoteResolver({ provider: 'azure-devops', repository: 'repo', organization: 'org' });
    expect(ado.providerType).toBe('azure-devops');

    const custom = createRemoteResolver({ provider: 'custom', repository: 'repo' });
    expect(custom.providerType).toBe('custom');
  });

  it('RemoteIndexLoader loads from local file path correctly', async () => {
    const mockIndexPath = resolve(__dirname, 'fixtures/mock-index.json');
    // Create temporary mock index file
    const fs = await import('node:fs');
    if (!existsSync(resolve(__dirname, 'fixtures'))) {
      fs.mkdirSync(resolve(__dirname, 'fixtures'), { recursive: true });
    }

    const mockData = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      documents: {
        '0001': {
          id: '0001',
          filePath: 'docs/adr/0001.md',
          contentHash: 'hash123',
          rawContent: '# ADR 0001',
          sections: {
            title: 'Test ADR',
            status: 'accepted',
            context: 'Context',
            decision: 'Decision',
          },
          metadata: {
            id: '0001',
            title: 'Test ADR',
            status: 'accepted',
          },
        },
      },
      chunks: [],
    };

    fs.writeFileSync(mockIndexPath, JSON.stringify(mockData), 'utf8');

    const result = await RemoteIndexLoader.loadIndex(mockIndexPath, {
      cacheDir: resolve(__dirname, '../.test-cache'),
    });

    expect(result.fromCache).toBe(false);
    expect(result.storeData.documents['0001'].metadata.title).toBe('Test ADR');

    // Cleanup
    if (existsSync(mockIndexPath)) {
      rmSync(mockIndexPath);
    }
  });
});
