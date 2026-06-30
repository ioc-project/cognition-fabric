// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR from 'swr';
import {cfnApi} from '@/api/endpoints';
import type {CognitionFabricTopologyResponse} from '@/api/endpoints/cfn';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';

export function useCfnTopology() {
  const {data, error, isLoading, mutate} = useSWR<CognitionFabricTopologyResponse>(swrKeys.cfnTopology(), () => cfnApi.topology(), {
    revalidateOnMount: true
  });

  return {
    topology: data ?? null,
    nodes: data?.cognition_fabric_nodes ?? [],
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  } as const;
}
