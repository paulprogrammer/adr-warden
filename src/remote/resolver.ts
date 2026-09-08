import type { AdrRemoteResolver, RemoteProviderConfig } from './types.js';
import { GitHubRemoteResolver } from './providers/github.js';
import { AzureDevOpsRemoteResolver } from './providers/azure-devops.js';
import { CustomRemoteResolver } from './providers/custom.js';

export function createRemoteResolver(config: RemoteProviderConfig): AdrRemoteResolver {
  switch (config.provider) {
    case 'github':
      return new GitHubRemoteResolver(config);
    case 'azure-devops':
      return new AzureDevOpsRemoteResolver(config);
    case 'custom':
    default:
      return new CustomRemoteResolver(config);
  }
}
