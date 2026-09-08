import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { CachedIndexMetadata, IndexLoadOptions } from './types.js';
import type { SerializedVectorStore } from '../vector-store.js';

export interface IndexLoadResult {
  storeData: SerializedVectorStore;
  fromCache: boolean;
  source: string;
}

export class RemoteIndexLoader {
  public static async loadIndex(
    sourceUrlOrPath: string,
    options: IndexLoadOptions
  ): Promise<IndexLoadResult> {
    const isRemote =
      sourceUrlOrPath.startsWith('http://') || sourceUrlOrPath.startsWith('https://');

    if (!isRemote) {
      const resolvedPath = resolve(sourceUrlOrPath);
      if (!existsSync(resolvedPath)) {
        throw new Error(`Local index file not found: ${resolvedPath}`);
      }
      const raw = readFileSync(resolvedPath, 'utf8');
      const storeData = JSON.parse(raw) as SerializedVectorStore;
      return {
        storeData,
        fromCache: false,
        source: resolvedPath,
      };
    }

    const cacheDir = resolve(options.cacheDir);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    const cachedIndexPath = join(cacheDir, 'remote-index.json');
    const cachedMetaPath = join(cacheDir, 'remote-index.meta.json');

    let meta: CachedIndexMetadata | undefined;
    if (existsSync(cachedMetaPath)) {
      try {
        meta = JSON.parse(readFileSync(cachedMetaPath, 'utf8')) as CachedIndexMetadata;
      } catch {
        meta = undefined;
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': 'adr-warden',
      Accept: 'application/json, text/plain, */*',
    };

    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    // Conditional GET if we have cached file and metadata
    if (!options.force && existsSync(cachedIndexPath) && meta && meta.url === sourceUrlOrPath) {
      if (meta.etag) {
        headers['If-None-Match'] = meta.etag;
      }
      if (meta.lastModified) {
        headers['If-Modified-Since'] = meta.lastModified;
      }
    }

    try {
      const response = await fetch(sourceUrlOrPath, { headers });

      if (response.status === 304 && existsSync(cachedIndexPath)) {
        // Cache is still fresh
        const content = readFileSync(cachedIndexPath, 'utf8');
        return {
          storeData: JSON.parse(content) as SerializedVectorStore,
          fromCache: true,
          source: sourceUrlOrPath,
        };
      }

      if (!response.ok) {
        // If network failed but we have a valid offline cache, fall back
        if (existsSync(cachedIndexPath)) {
          const content = readFileSync(cachedIndexPath, 'utf8');
          return {
            storeData: JSON.parse(content) as SerializedVectorStore,
            fromCache: true,
            source: sourceUrlOrPath,
          };
        }
        throw new Error(
          `Failed to fetch remote index from ${sourceUrlOrPath}: HTTP ${response.status} ${response.statusText}`
        );
      }

      const text = await response.text();
      const storeData = JSON.parse(text) as SerializedVectorStore;

      // Persist to local disk cache
      writeFileSync(cachedIndexPath, text, 'utf8');

      const etag = response.headers.get('etag') || undefined;
      const lastModified = response.headers.get('last-modified') || undefined;
      const contentHash = createHash('sha256').update(text).digest('hex');

      const newMeta: CachedIndexMetadata = {
        url: sourceUrlOrPath,
        etag,
        lastModified,
        fetchedAt: new Date().toISOString(),
        contentHash,
      };

      writeFileSync(cachedMetaPath, JSON.stringify(newMeta, null, 2), 'utf8');

      return {
        storeData,
        fromCache: false,
        source: sourceUrlOrPath,
      };
    } catch (err) {
      // Offline fallback
      if (existsSync(cachedIndexPath)) {
        const content = readFileSync(cachedIndexPath, 'utf8');
        return {
          storeData: JSON.parse(content) as SerializedVectorStore,
          fromCache: true,
          source: sourceUrlOrPath,
        };
      }
      throw err;
    }
  }
}
