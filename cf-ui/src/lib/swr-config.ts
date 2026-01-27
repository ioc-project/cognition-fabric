/**
 * SWR cache keys for consistent data management across hooks
 */
export const swrKeys = {
  workspaces: () => ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,

  users: (workspaceId: string) => ['users', workspaceId] as const,
  apiKeys: (workspaceId: string) => ['api-keys', workspaceId] as const,

  software: (workspaceId: string) => ['software', workspaceId] as const,
  softwareTemplates: (templateType: 'ReasonerTemplates') => ['software-templates', templateType] as const,
  softwareTemplatesAll: () => ['software-templates-all'] as const,

  mas: (workspaceId: string) => ['mas-list', workspaceId] as const,
  masDetails: (workspaceId: string, masId: string) => ['mas-details', workspaceId, masId] as const,

  cognitiveAgents: (workspaceId: string) => ['cognitive-agents', workspaceId] as const,
  cognitiveAgentDetails: (workspaceId: string, cognitiveAgentId: string) => ['cognitive-agent-details', workspaceId, cognitiveAgentId] as const,

  reasoningHistory: (workspaceId: string, filters?: string) => ['reasoning-history-list', workspaceId, filters] as const,
  reasoningHistoryDetails: (workspaceId: string, historyId: string) => ['reasoning-history-details', workspaceId, historyId] as const
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
