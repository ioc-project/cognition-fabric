'use client';

import useSWR from 'swr';
import {masMetricsApi, type MASMetricsFilters, type MASMetricsResponse} from '@/api/endpoints/mas-metrics';
import {swrKeys} from '@/lib/swr-config';

export function useMASMetrics(workspaceId: string | null | undefined, masId: string | null | undefined, filters: MASMetricsFilters | null) {
  const filtersKey = filters
    ? {
        start_time: filters.start_time,
        end_time: filters.end_time,
        ...(filters.ce_id && {ce_id: filters.ce_id}),
        ...(filters.agent_id && {agent_id: filters.agent_id}),
        ...(filters.metric_name && {metric_name: filters.metric_name})
      }
    : null;

  const key = workspaceId && masId && filtersKey ? swrKeys.masMetrics(workspaceId, masId, filtersKey) : null;

  const {data, error, isLoading, mutate} = useSWR<MASMetricsResponse>(key, () => masMetricsApi.fetch(workspaceId!, masId!, filters!), {
    revalidateOnFocus: false,
    dedupingInterval: 30_000
  });

  return {data, isLoading, error, mutate};
}
