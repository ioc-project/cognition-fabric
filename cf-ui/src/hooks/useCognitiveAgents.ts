'use client';

import useSWR from 'swr';
import {cognitiveAgentApi} from '@/api/endpoints/cognitive-agent';
import type {CognitiveAgent, CognitiveAgentListItem, CreateCognitiveAgentRequest, UpdateCognitiveAgentRequest} from '@/api/types/cognitive-agent';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

export function useCognitiveAgents(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitiveAgentListItem[]>(
    workspaceId ? swrKeys.cognitiveAgents(workspaceId) : null,
    () => cognitiveAgentApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    (payload: CreateCognitiveAgentRequest) => cognitiveAgentApi.create(workspaceId, payload)
  );

  const addCognitiveAgent = async (payload: CreateCognitiveAgentRequest) => {
    const response = await runAddCognitiveAgent(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runUpdateCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    ({cognitiveAgentId, payload}: {cognitiveAgentId: string; payload: UpdateCognitiveAgentRequest}) =>
      cognitiveAgentApi.update(workspaceId, cognitiveAgentId, payload)
  );

  const updateCognitiveAgent = async (cognitiveAgentId: string, payload: UpdateCognitiveAgentRequest) => {
    const response = await runUpdateCognitiveAgent({cognitiveAgentId, payload});
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    (cognitiveAgentId: string) => cognitiveAgentApi.delete(workspaceId, cognitiveAgentId)
  );

  const deleteCognitiveAgent = async (cognitiveAgentId: string) => {
    try {
      await runDeleteCognitiveAgent(cognitiveAgentId);
      await mutate(undefined, {revalidate: true});
    } catch (err) {
      throw new Error(parseError(err));
    }
  };

  const cognitiveAgents = data ? sortByCreatedAtDesc(data) : undefined;

  return {
    cognitiveAgents,
    isLoading,
    isValidating,
    error,
    mutate,
    addCognitiveAgent,
    updateCognitiveAgent,
    deleteCognitiveAgent
  };
}

export function useCognitiveAgent(workspaceId: string, cognitiveAgentId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitiveAgent>(
    workspaceId && cognitiveAgentId ? swrKeys.cognitiveAgentDetails(workspaceId, cognitiveAgentId) : null,
    () => cognitiveAgentApi.get(workspaceId, cognitiveAgentId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  return {
    cognitiveAgent: data,
    isLoading,
    isValidating,
    error,
    mutate
  };
}
