'use client';

import useSWR from 'swr';
import {cognitionEngineApi} from '@/api/endpoints/cognition-engine';
import type {CognitionEngineDetail, CognitionEngineListItem} from '@/api/endpoints/cognition-engine';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';

export function useCognitionEngines() {
  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitionEngineListItem[]>(
    swrKeys.cognitionEngines(),
    () => cognitionEngineApi.list(),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const cognitionEngines = data ? sortByCreatedAtDesc(data) : undefined;

  return {
    cognitionEngines,
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useCognitionEngine(cognitionEngineId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitionEngineDetail>(
    cognitionEngineId ? swrKeys.cognitionEngineDetails(cognitionEngineId) : null,
    () => cognitionEngineApi.get(cognitionEngineId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  return {
    cognitionEngine: data,
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate
  };
}
