// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR, {mutate as globalMutate} from 'swr';
import {cfnApi} from '@/api/endpoints';
import type {CreateCfnRequest, ListCfnResponse} from '@/api/types/cfn';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';
import {swrKeys} from '@/lib/swr-config';

export function useCfn(workspaceId?: string) {
  const swrKey = swrKeys.cfn(workspaceId);
  const {data, error, isLoading, isValidating, mutate} = useSWR<ListCfnResponse>(swrKey, () => cfnApi.list(workspaceId), {
    revalidateOnMount: true,
    keepPreviousData: true
  });

  const {run: runAddCfn} = useInvalidateMutation({keys: swrKey, prefixes: [swrKeys.cfn()]}, (payload: CreateCfnRequest) => cfnApi.create(payload));

  const addCfn = async (payload: CreateCfnRequest) => {
    const response = await runAddCfn(payload);
    await mutate(undefined, {revalidate: true});
    await globalMutate(swrKeys.cfnTopology());
    return response;
  };

  const {run: runDeleteCfn} = useInvalidateMutation({keys: swrKey, prefixes: [swrKeys.cfn()]}, (cfnId: string) => cfnApi.delete(cfnId));

  const deleteCfn = async (cfnId: string) => {
    const prev = data?.nodes || [];
    await mutate({nodes: prev.filter((c) => c.id !== cfnId), total: Math.max((data?.total || 1) - 1, 0)}, {revalidate: false});
    try {
      await runDeleteCfn(cfnId);
    } catch (e) {
      await mutate(data, {revalidate: false});
      throw e;
    }
  };

  const {run: runEnableCfn} = useInvalidateMutation({keys: swrKey, prefixes: [swrKeys.cfn()]}, (cfnId: string) => cfnApi.enable(cfnId));

  const enableCfn = async (cfnId: string) => {
    const result = await runEnableCfn(cfnId);
    await mutate(undefined, {revalidate: true});
    await globalMutate(swrKeys.cfnTopology());
    return result;
  };

  const {run: runDisableCfn} = useInvalidateMutation({keys: swrKey, prefixes: [swrKeys.cfn()]}, (cfnId: string) => cfnApi.disable(cfnId));

  const disableCfn = async (cfnId: string) => {
    const result = await runDisableCfn(cfnId);
    await mutate(undefined, {revalidate: true});
    await globalMutate(swrKeys.cfnTopology());
    return result;
  };

  return {
    cfns: sortByCreatedAtDesc(data?.nodes || []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addCfn,
    deleteCfn,
    enableCfn,
    disableCfn
  } as const;
}
