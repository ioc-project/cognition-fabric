// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useParams, usePathname} from 'next/navigation';
import {useWorkspace} from '@/hooks/useWorkspaces';

export function useCurrentWorkspace() {
  const params = useParams();
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith('/workspaces');

  const rawId = params?.id;
  const workspaceId = isWorkspaceRoute ? ((Array.isArray(rawId) ? rawId[0] : rawId) ?? '') : '';
  const {workspace, isLoading: workspaceLoading, mutate} = useWorkspace(workspaceId);

  return {
    workspaceId: workspaceId || undefined,
    workspace,
    isLoading: workspaceLoading,
    mutate
  };
}
