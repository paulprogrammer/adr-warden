import type { AdrRemoteResolver, AdrUrlInfo, RemoteProviderConfig } from '../types.js';

function cleanPath(baseDir: string, relativePath?: string, adrId?: string): string {
  if (relativePath) {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.startsWith(baseDir.replace(/^\/+|\/+$/g, ''))) {
      return `/${normalized}`;
    }
    return `/${baseDir.replace(/^\/+|\/+$/g, '')}/${normalized}`;
  }
  const cleanBase = baseDir.replace(/^\/+|\/+$/g, '');
  const idStr = (adrId || '0001').padStart(4, '0');
  return `/${cleanBase}/${idStr}.md`;
}

export class AzureDevOpsRemoteResolver implements AdrRemoteResolver {
  public readonly providerType = 'azure-devops';
  private organization: string;
  private project: string;
  private repository: string;
  private branch: string;
  private baseDir: string;
  private token?: string;

  constructor(config: RemoteProviderConfig) {
    this.organization = config.organization || config.owner || '';
    this.project = config.project || '';
    this.repository = config.repository;
    this.branch = config.branch || 'main';
    this.baseDir = config.baseDir || 'docs/adr';
    this.token =
      config.token ||
      process.env.SYSTEM_ACCESSTOKEN ||
      process.env.AZURE_DEVOPS_EXT_PAT ||
      process.env.ADO_PAT;
  }

  public resolveUrls(adrId: string, relativePath?: string): AdrUrlInfo {
    const path = cleanPath(this.baseDir, relativePath, adrId);
    const encodedPath = encodeURIComponent(path);

    // Web link for browser review
    const webUrl = `https://dev.azure.com/${this.organization}/${this.project}/_git/${this.repository}?path=${encodedPath}&version=GB${this.branch}`;

    // Git items REST API for downloading raw file content
    const rawUrl = `https://dev.azure.com/${this.organization}/${this.project}/_apis/git/repositories/${this.repository}/items?path=${encodedPath}&versionDescriptor.version=${encodeURIComponent(this.branch)}&versionDescriptor.versionType=branch&$format=octetStream&api-version=6.0`;

    return {
      id: adrId,
      webUrl,
      rawUrl,
    };
  }

  public async fetchRawContent(adrId: string, relativePath?: string): Promise<string> {
    const { rawUrl } = this.resolveUrls(adrId, relativePath);
    const headers: Record<string, string> = {
      Accept: 'text/plain, application/octet-stream, */*',
    };

    if (this.token) {
      // Check if JWT access token (e.g. Azure Pipelines SYSTEM_ACCESSTOKEN)
      if (this.token.startsWith('eyJ')) {
        headers.Authorization = `Bearer ${this.token}`;
      } else {
        // Standard ADO Personal Access Token (empty username)
        const basic = Buffer.from(`:${this.token}`).toString('base64');
        headers.Authorization = `Basic ${basic}`;
      }
    }

    const response = await fetch(rawUrl, { headers });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ADR ${adrId} from Azure DevOps (${rawUrl}): HTTP ${response.status} ${response.statusText}`
      );
    }

    return response.text();
  }
}
