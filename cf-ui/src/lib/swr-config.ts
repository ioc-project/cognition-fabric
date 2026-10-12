// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * SWR cache keys for consistent data management across hooks
 */
export const swrKeys = {
  workspaces: () => ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  defaultWorkspace: () => ['default-workspace'] as const,

  users: (workspaceId: string) => ['users', workspaceId] as const,

  mas: (workspaceId: string) => ['mas-list', workspaceId] as const,
  masDetails: (workspaceId: string, masId: string) => ['mas-details', workspaceId, masId] as const,

  cognitionEngines: () => ['cognition-engines'] as const,
  cognitionEngineDetails: (cognitionEngineId: string) => ['cognition-engine-details', cognitionEngineId] as const,

  cfn: (workspaceId?: string) => (workspaceId ? (['cfn-list', workspaceId] as const) : (['cfn-list'] as const)),
  cfnDetails: (cfnId: string) => ['cfn-details', cfnId] as const,

  cfnTopology: () => ['cfn-topology'] as const
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
