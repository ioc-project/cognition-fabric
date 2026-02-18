'use client';

import useSWR from 'swr';
import {cognitiveEngineApi} from '@/api/endpoints';
import type {CognitiveEngine, CreateCognitiveEngineRequest} from '@/api/types/cognitive-engine';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

export function useCognitiveEngines(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitiveEngine[]>(
    workspaceId ? swrKeys.cognitiveEngines(workspaceId) : null,
    () => cognitiveEngineApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddCognitiveEngine} = useInvalidateMutation(
    {keys: swrKeys.cognitiveEngines(workspaceId), prefixes: [['cognitive-engines', workspaceId]]},
    (payload: CreateCognitiveEngineRequest) => cognitiveEngineApi.create(workspaceId, payload)
  );

  const addCognitiveEngine = async (payload: CreateCognitiveEngineRequest) => {
    const response = await runAddCognitiveEngine(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteCognitiveEngine} = useInvalidateMutation(
    {keys: swrKeys.cognitiveEngines(workspaceId), prefixes: [['cognitive-engines', workspaceId]]},
    (cognitiveEngineId: string) => cognitiveEngineApi.delete(workspaceId, cognitiveEngineId)
  );

  const deleteCognitiveEngine = async (cognitiveEngineId: string) => {
    try {
      await runDeleteCognitiveEngine(cognitiveEngineId);
      await mutate(undefined, {revalidate: true});
    } catch (err) {
      throw new Error(parseError(err));
    }
  };

  const cognitiveEngines = data ? sortByCreatedAtDesc(data) : undefined;

  return {
    cognitiveEngines,
    isLoading,
    isValidating,
    error,
    mutate,
    addCognitiveEngine,
    deleteCognitiveEngine
  };
}
