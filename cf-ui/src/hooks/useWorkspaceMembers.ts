// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR from 'swr';
import {memberApi} from '@/api/endpoints';
import type {ListWorkspaceMembersResponse, UpdateMemberRoleRequest} from '@/api/types/member';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

export function useWorkspaceMembers(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR<ListWorkspaceMembersResponse>(
    workspaceId ? swrKeys.workspaceMembers(workspaceId) : null,
    () => memberApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runUpdateMemberRole} = useInvalidateMutation(
    swrKeys.workspaceMembers(workspaceId),
    ({memberId, role}: {memberId: string; role: UpdateMemberRoleRequest}) => memberApi.updateRole(workspaceId, memberId, role)
  );

  const updateMemberRole = async (memberId: string, role: UpdateMemberRoleRequest) => {
    await runUpdateMemberRole({memberId, role});
    await mutate();
  };

  const {run: runRemoveMember} = useInvalidateMutation(swrKeys.workspaceMembers(workspaceId), (memberId: string) =>
    memberApi.remove(workspaceId, memberId)
  );

  const removeMember = async (memberId: string) => {
    await mutate(
      async (current) => {
        await runRemoveMember(memberId);
        return {
          members: (current?.members || []).filter((member) => member.id !== memberId),
          total: Math.max((current?.total || 1) - 1, 0)
        };
      },
      {
        optimisticData: (current) => ({
          members: (current?.members || []).filter((member) => member.id !== memberId),
          total: Math.max((current?.total || 1) - 1, 0)
        }),
        rollbackOnError: true,
        revalidate: false
      }
    );
  };

  return {
    members: data?.members || [],
    total: data?.total || 0,
    isLoading,
    error: error ? parseError(error) : null,
    mutate,
    updateMemberRole,
    removeMember
  };
}
