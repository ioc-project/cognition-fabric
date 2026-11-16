// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR from 'swr';
import {workspaceApi} from '@/api/endpoints';
import {swrKeys} from '@/lib/swr-config';
import type {Workspace} from '@/api/types/workspace';

/**
 * Hook to fetch and return the default workspace.
 * The default workspace is identified by the name "Default Workspace" (case-insensitive).
 */
export function useDefaultWorkspace() {
  const {data, error, isLoading, mutate} = useSWR<Workspace | null>(
    swrKeys.defaultWorkspace(),
    async () => {
      try {
        const list = await workspaceApi.list();
        const defaultWorkspace = (list.workspaces || []).find(
          (w) => typeof w.name === 'string' && w.name.trim().toLowerCase() === 'default workspace'
        );
        return defaultWorkspace || null;
      } catch {
        return null;
      }
    },
    {
      revalidateOnMount: true,
      keepPreviousData: true
    }
  );

  return {
    defaultWorkspace: data,
    defaultWorkspaceId: data?.id,
    isLoading,
    error,
    mutate
  };
}
