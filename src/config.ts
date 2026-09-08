import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { RemoteProviderConfig } from './remote/types.js';

export interface WardenConfig {
  mode?: 'author' | 'construct' | 'all';
  remote?: RemoteProviderConfig;
  indexUrl?: string;
  cacheDir?: string;
  adrDirs?: string[];
  rules?: {
    flagProposed?: boolean;
    failOnNonCompliance?: boolean;
    threshold?: number;
    topK?: number;
  };
}

export function loadWardenConfig(explicitPath?: string): WardenConfig {
  let foundConfig: WardenConfig = {};

  if (explicitPath) {
    const full = resolve(explicitPath);
    if (existsSync(full)) {
      try {
        foundConfig = JSON.parse(readFileSync(full, 'utf8')) as WardenConfig;
      } catch (err) {
        throw new Error(`Failed to parse config at ${full}: ${(err as Error).message}`);
      }
    } else {
      throw new Error(`Config file not found: ${full}`);
    }
  } else {
    // Search current directory and up to root
    const candidates = [
      '.wardenrc.json',
      '.wardenrc',
      'warden.config.json',
      '.warden.json',
    ];

    let currentDir = process.cwd();
    while (true) {
      for (const cand of candidates) {
        const p = join(currentDir, cand);
        if (existsSync(p)) {
          try {
            foundConfig = JSON.parse(readFileSync(p, 'utf8')) as WardenConfig;
            break;
          } catch {
            // Ignore parse errors on auto-discovery
          }
        }
      }
      if (Object.keys(foundConfig).length > 0) break;
      const parent = dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }

  // Overlay environment variables
  if (process.env.WARDEN_MODE) {
    foundConfig.mode = process.env.WARDEN_MODE as 'author' | 'construct' | 'all';
  }
  if (process.env.WARDEN_INDEX_URL) {
    foundConfig.indexUrl = process.env.WARDEN_INDEX_URL;
  }
  if (process.env.WARDEN_CACHE_DIR) {
    foundConfig.cacheDir = process.env.WARDEN_CACHE_DIR;
  }

  // If remote is configured partially or via env
  if (process.env.WARDEN_REMOTE_PROVIDER) {
    foundConfig.remote = {
      provider: process.env.WARDEN_REMOTE_PROVIDER as any,
      repository: process.env.WARDEN_REMOTE_REPO || '',
      organization: process.env.WARDEN_REMOTE_ORG,
      project: process.env.WARDEN_REMOTE_PROJECT,
      branch: process.env.WARDEN_REMOTE_BRANCH,
      baseDir: process.env.WARDEN_REMOTE_BASE_DIR,
      indexUrl: process.env.WARDEN_INDEX_URL || foundConfig.indexUrl,
      ...foundConfig.remote,
    };
  }

  return foundConfig;
}
