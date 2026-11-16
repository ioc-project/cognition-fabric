// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR from 'swr';
import {masApi} from '@/api/endpoints';
import type {MultiAgenticSystem, MultiAgenticSystemRequest} from '@/api/endpoints/mas';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

export function useMAS(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<MultiAgenticSystem[]>(
    workspaceId ? swrKeys.mas(workspaceId) : null,
    () => masApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddMAS} = useInvalidateMutation(
    {keys: swrKeys.mas(workspaceId), prefixes: [['mas-list', workspaceId]]},
    (payload: MultiAgenticSystemRequest) => masApi.create(workspaceId, payload)
  );

  const addMAS = async (payload: MultiAgenticSystemRequest) => {
    const response = await runAddMAS(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteMAS} = useInvalidateMutation({keys: swrKeys.mas(workspaceId), prefixes: [['mas-list', workspaceId]]}, (masId: string) =>
    masApi.delete(workspaceId, masId)
  );

  const deleteMAS = async (masId: string) => {
    const prev = Array.isArray(data) ? data : [];
    await mutate(
      prev.filter((m) => m.id !== masId),
      {revalidate: false}
    );
    try {
      await runDeleteMAS(masId);
    } catch (e) {
      await mutate(prev, {revalidate: false});
      throw e;
    }
  };

  return {
    masList: sortByCreatedAtDesc(Array.isArray(data) ? data : []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addMAS,
    deleteMAS
  } as const;
}
