'use client';

import useSWR from 'swr';
import {cognitionEngineApi} from '@/api/endpoints/cognition-engine';
import type {CognitionEngineDetail, CognitionEngineListItem} from '@/api/endpoints/cognition-engine';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useDefaultWorkspace} from './useDefaultWorkspace';

export function useCognitionEngines() {
  const {defaultWorkspaceId} = useDefaultWorkspace();

  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitionEngineListItem[]>(
    defaultWorkspaceId ? swrKeys.cognitionEngines() : null,
    () => cognitionEngineApi.list(defaultWorkspaceId!),
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
  const {defaultWorkspaceId} = useDefaultWorkspace();

  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitionEngineDetail>(
    defaultWorkspaceId && cognitionEngineId ? swrKeys.cognitionEngineDetails(cognitionEngineId) : null,
    () => cognitionEngineApi.get(defaultWorkspaceId!, cognitionEngineId),
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
