import type { AdrRemoteResolver, AdrUrlInfo, RemoteProviderConfig } from '../types.js';

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
}

export class CustomRemoteResolver implements AdrRemoteResolver {
  public readonly providerType = 'custom';
  private webUrlTemplate: string;
  private rawUrlTemplate: string;
  private branch: string;
  private baseDir: string;
  private token?: string;

  constructor(config: RemoteProviderConfig) {
    this.webUrlTemplate = config.webUrlTemplate || '';
    this.rawUrlTemplate = config.rawUrlTemplate || config.webUrlTemplate || '';
    this.branch = config.branch || 'main';
    this.baseDir = (config.baseDir || 'docs/adr').replace(/^\/+|\/+$/g, '');
    this.token = config.token;
  }

  public resolveUrls(adrId: string, relativePath?: string): AdrUrlInfo {
    const id = (adrId || '0001').padStart(4, '0');
    const cleanRel = (relativePath || `${id}.md`).replace(/\\/g, '/').replace(/^\/+/, '');
    const filePath = cleanRel.startsWith(this.baseDir) ? cleanRel : `${this.baseDir}/${cleanRel}`;

    const vars: Record<string, string> = {
      id,
      relativePath: cleanRel,
      filePath,
      branch: this.branch,
    };

    const webUrl = interpolate(this.webUrlTemplate, vars) || filePath;
    const rawUrl = interpolate(this.rawUrlTemplate, vars) || webUrl;

    return {
      id: adrId,
      webUrl,
      rawUrl,
    };
  }

  public async fetchRawContent(adrId: string, relativePath?: string): Promise<string> {
    const { rawUrl } = this.resolveUrls(adrId, relativePath);
    if (!rawUrl || !rawUrl.startsWith('http')) {
      throw new Error(`Cannot fetch raw content without a valid HTTP(S) rawUrlTemplate. Target: ${rawUrl}`);
    }

    const headers: Record<string, string> = {
      'User-Agent': 'adr-warden',
      Accept: 'text/plain, */*',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(rawUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch ADR ${adrId} from custom provider (${rawUrl}): HTTP ${response.status}`);
    }

    return response.text();
  }
}
