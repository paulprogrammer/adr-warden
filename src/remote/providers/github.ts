import type { AdrRemoteResolver, AdrUrlInfo, RemoteProviderConfig } from '../types.js';

function cleanPath(baseDir: string, relativePath?: string, adrId?: string): string {
  if (relativePath) {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.startsWith(baseDir.replace(/^\/+|\/+$/g, ''))) {
      return normalized;
    }
    return `${baseDir.replace(/^\/+|\/+$/g, '')}/${normalized}`;
  }
  const cleanBase = baseDir.replace(/^\/+|\/+$/g, '');
  const idStr = (adrId || '0001').padStart(4, '0');
  return `${cleanBase}/${idStr}.md`;
}

export class GitHubRemoteResolver implements AdrRemoteResolver {
  public readonly providerType = 'github';
  private owner: string;
  private repository: string;
  private branch: string;
  private baseDir: string;
  private token?: string;

  constructor(config: RemoteProviderConfig) {
    this.owner = config.owner || config.organization || '';
    this.repository = config.repository;
    this.branch = config.branch || 'main';
    this.baseDir = config.baseDir || 'docs/adr';
    this.token = config.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }

  public resolveUrls(adrId: string, relativePath?: string): AdrUrlInfo {
    const path = cleanPath(this.baseDir, relativePath, adrId);
    const webUrl = `https://github.com/${this.owner}/${this.repository}/blob/${this.branch}/${path}`;
    const rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repository}/${this.branch}/${path}`;

    return {
      id: adrId,
      webUrl,
      rawUrl,
    };
  }

  public async fetchRawContent(adrId: string, relativePath?: string): Promise<string> {
    const { rawUrl } = this.resolveUrls(adrId, relativePath);
    const headers: Record<string, string> = {
      'User-Agent': 'adr-warden',
      Accept: 'application/vnd.github.v3.raw, text/plain, */*',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(rawUrl, { headers });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ADR ${adrId} from GitHub (${rawUrl}): HTTP ${response.status} ${response.statusText}`
      );
    }

    return response.text();
  }
}
