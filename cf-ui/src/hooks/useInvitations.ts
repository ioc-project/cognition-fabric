// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR from 'swr';
import {invitationApi} from '@/api/endpoints';
import type {CreateInvitationRequest, ListInvitationsResponse} from '@/api/types/invitation';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

export function useWorkspaceInvitations(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR<ListInvitationsResponse>(
    workspaceId ? swrKeys.workspaceInvitations(workspaceId) : null,
    () => invitationApi.listWorkspaceInvitations(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runCreateInvitation} = useInvalidateMutation(swrKeys.workspaceInvitations(workspaceId), (payload: CreateInvitationRequest) =>
    invitationApi.create(workspaceId, payload)
  );

  const createInvitation = async (payload: CreateInvitationRequest) => {
    const response = await runCreateInvitation(payload);
    await mutate();
    return response;
  };

  const {run: runCancelInvitation} = useInvalidateMutation(swrKeys.workspaceInvitations(workspaceId), (invitationId: string) =>
    invitationApi.cancel(workspaceId, invitationId)
  );

  const cancelInvitation = async (invitationId: string) => {
    await mutate(
      async (current) => {
        await runCancelInvitation(invitationId);
        return {
          invitations: (current?.invitations || []).filter((inv) => inv.id !== invitationId),
          total: Math.max((current?.total || 1) - 1, 0)
        };
      },
      {
        optimisticData: (current) => ({
          invitations: (current?.invitations || []).filter((inv) => inv.id !== invitationId),
          total: Math.max((current?.total || 1) - 1, 0)
        }),
        rollbackOnError: true,
        revalidate: false
      }
    );
  };

  return {
    invitations: data?.invitations || [],
    total: data?.total || 0,
    isLoading,
    error: error ? parseError(error) : null,
    mutate,
    createInvitation,
    cancelInvitation
  };
}

export function useMyPendingInvitations() {
  const {data, error, isLoading, mutate} = useSWR<ListInvitationsResponse>(
    swrKeys.myPendingInvitations(),
    () => invitationApi.getMyPendingInvitations(),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAcceptInvitation} = useInvalidateMutation(swrKeys.myPendingInvitations(), (invitationId: string) =>
    invitationApi.accept(invitationId)
  );

  const acceptInvitation = async (invitationId: string) => {
    await runAcceptInvitation(invitationId);
    await mutate();
  };

  const {run: runDeclineInvitation} = useInvalidateMutation(swrKeys.myPendingInvitations(), (invitationId: string) =>
    invitationApi.decline(invitationId)
  );

  const declineInvitation = async (invitationId: string) => {
    await runDeclineInvitation(invitationId);
    await mutate();
  };

  return {
    invitations: data?.invitations || [],
    pendingCount: data?.invitations.filter((inv) => inv.status === 'pending').length || 0,
    total: data?.total || 0,
    isLoading,
    error: error ? parseError(error) : null,
    mutate,
    acceptInvitation,
    declineInvitation
  };
}
