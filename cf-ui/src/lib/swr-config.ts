/**
 * SWR cache keys for consistent data management across hooks
 */
export const swrKeys = {
  workspaces: () => ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  users: (workspaceId: string) => ['users', workspaceId] as const,
  apiKeys: (workspaceId: string) => ['api-keys', workspaceId] as const,
  software: (workspaceId: string) => ['software', workspaceId] as const,
  softwareTemplates: (templateType: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates') => ['software-templates', templateType] as const
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
