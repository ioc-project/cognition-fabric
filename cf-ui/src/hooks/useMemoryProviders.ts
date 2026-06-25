// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR from 'swr';
import {memoryProviderApi} from '@/api/endpoints';
import type {CreateMemoryProviderRequest, ListMemoryProviderResponse} from '@/api/types/memory-provider';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

export function useMemoryProviders() {
  const {data, error, isLoading, isValidating, mutate} = useSWR<ListMemoryProviderResponse>(
    swrKeys.memoryProviders(),
    () => memoryProviderApi.list(),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddProvider} = useInvalidateMutation(
    {keys: swrKeys.memoryProviders(), prefixes: [['memory-providers']]},
    (payload: CreateMemoryProviderRequest) => memoryProviderApi.create(payload)
  );

  const addProvider = async (payload: CreateMemoryProviderRequest) => {
    const response = await runAddProvider(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteProvider} = useInvalidateMutation({keys: swrKeys.memoryProviders(), prefixes: [['memory-providers']]}, (providerId: string) =>
    memoryProviderApi.delete(providerId)
  );

  const deleteProvider = async (providerId: string) => {
    const prev = data?.providers || [];
    await mutate({providers: prev.filter((p) => p.id !== providerId), total: Math.max((data?.total || 1) - 1, 0)}, {revalidate: false});
    try {
      await runDeleteProvider(providerId);
    } catch (e) {
      await mutate(data, {revalidate: false});
      throw e;
    }
  };

  return {
    providers: sortByCreatedAtDesc(data?.providers || []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addProvider,
    deleteProvider
  } as const;
}
