// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR from 'swr';
import {workspaceApi} from '@/api/endpoints';
import type {Workspace, ListWorkspacesResponse} from '@/api/types/workspace';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';

export function useWorkspaces() {
  const {data, error, isLoading, mutate} = useSWR<ListWorkspacesResponse>(swrKeys.workspaces(), () => workspaceApi.list(), {
    revalidateOnMount: true,
    keepPreviousData: true
  });

  return {
    workspaces: sortByCreatedAtDesc(data?.workspaces || []),
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useWorkspace(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR<Workspace | null>(
    workspaceId ? swrKeys.workspace(workspaceId) : null,
    async () => {
      try {
        return await workspaceApi.get(workspaceId);
      } catch (e) {
        const list = await workspaceApi.list();
        const found = list.workspaces.find((w) => w.id === workspaceId);
        if (!found) {
          throw e;
        }
        return found;
      }
    },
    {
      keepPreviousData: true
    }
  );

  return {
    workspace: data || null,
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}
