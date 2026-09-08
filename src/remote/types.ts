export type RemoteProviderType = 'github' | 'azure-devops' | 'gitlab' | 'custom';

export interface RemoteProviderConfig {
  provider: RemoteProviderType;
  organization?: string;
  owner?: string;
  project?: string;
  repository: string;
  branch?: string;
  baseDir?: string;
  indexUrl?: string;
  token?: string;
  webUrlTemplate?: string;
  rawUrlTemplate?: string;
}

export interface AdrUrlInfo {
  id: string;
  webUrl: string;
  rawUrl: string;
}

export interface AdrRemoteResolver {
  readonly providerType: RemoteProviderType;
  resolveUrls(adrId: string, relativePath?: string): AdrUrlInfo;
  fetchRawContent(adrId: string, relativePath?: string): Promise<string>;
}

export interface IndexLoadOptions {
  cacheDir: string;
  force?: boolean;
  token?: string;
}

export interface CachedIndexMetadata {
  url: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: string;
  contentHash: string;
}
