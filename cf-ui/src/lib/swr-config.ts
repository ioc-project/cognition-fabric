/**
 * SWR cache keys for consistent data management across hooks
 */
export const swrKeys = {
  workspaces: () => ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  users: (workspaceId: string) => ['users', workspaceId] as const,
  apiKeys: (workspaceId: string) => ['api-keys', workspaceId] as const,
  software: (workspaceId: string) => ['software', workspaceId] as const
};
