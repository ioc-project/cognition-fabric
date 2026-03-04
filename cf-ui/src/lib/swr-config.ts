/**
 * SWR cache keys for consistent data management across hooks
 */
export const swrKeys = {
  workspaces: () => ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  defaultWorkspace: () => ['default-workspace'] as const,

  users: (workspaceId: string) => ['users', workspaceId] as const,
  apiKeys: () => ['api-keys'] as const,
  iamRoles: () => ['iam-roles'] as const,
  iamUsers: () => ['iam-users'] as const,

  mas: (workspaceId: string) => ['mas-list', workspaceId] as const,
  masDetails: (workspaceId: string, masId: string) => ['mas-details', workspaceId, masId] as const,

  cognitiveAgents: (workspaceId: string) => ['cognitive-agents', workspaceId] as const,
  cognitiveAgentDetails: (workspaceId: string, cognitiveAgentId: string) => ['cognitive-agent-details', workspaceId, cognitiveAgentId] as const,

  cfn: () => ['cfn-list'] as const,
  cfnDetails: (cfnId: string) => ['cfn-details', cfnId] as const,

  memoryProviders: () => ['memory-providers'] as const,
  memoryProviderDetails: (providerId: string) => ['memory-provider-details', providerId] as const,

  workspaceInvitations: (workspaceId: string) => ['workspace-invitations', workspaceId] as const,
  workspaceMembers: (workspaceId: string) => ['workspace-members', workspaceId] as const,
  myPendingInvitations: () => ['my-pending-invitations'] as const
};

import {fetchAPI} from '@/api/client';

export const swrFetcher = async (url: string) => {
  if (url.startsWith('/')) {
    return fetchAPI(url, {method: 'GET'});
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
};
