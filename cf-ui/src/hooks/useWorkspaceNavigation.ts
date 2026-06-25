// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useRouter} from 'next/navigation';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {routes, getWorkspaceBasePath} from '@/constants/routes';

export function useWorkspaceNavigation() {
  const router = useRouter();
  const {workspaceId} = useCurrentWorkspace();

  const currentId = workspaceId || undefined;
  const base = getWorkspaceBasePath(currentId);

  const goToWorkspace = (id: string) => router.push(routes.workspaces.details(id));

  return {currentId, base, goToWorkspace};
}
