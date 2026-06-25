// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useParams, usePathname} from 'next/navigation';
import {useWorkspace} from '@/hooks/useWorkspaces';
import {useWorkspaceMembers} from '@/hooks/useWorkspaceMembers';
import {useSession} from 'next-auth/react';
import type {MemberRole} from '@/api/types';

export function useCurrentWorkspace() {
  const params = useParams();
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith('/workspaces');
  const {data: session} = useSession();

  const rawId = params?.id;
  const workspaceId = isWorkspaceRoute ? ((Array.isArray(rawId) ? rawId[0] : rawId) ?? '') : '';
  const {workspace, isLoading: workspaceLoading, mutate} = useWorkspace(workspaceId);
  const {members, isLoading: membersLoading, mutate: mutateMembers} = useWorkspaceMembers(workspaceId);

  const currentUserId = session?.user?.id;
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const userRole: MemberRole | undefined = currentMember?.role;
  const isAdmin = userRole === 'admin';

  return {
    workspaceId: workspaceId || undefined,
    workspace,
    isLoading: workspaceLoading,
    membersLoading,
    members,
    mutate,
    mutateMembers,
    userRole,
    isAdmin
  };
}
