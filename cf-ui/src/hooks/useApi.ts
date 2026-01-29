'use client';

import useSWR from 'swr';
import {workspaceApi, apiKeyApi, softwareApi, cognitiveAgentApi, masApi} from '@/api/endpoints';
import type {Workspace, ListWorkspacesResponse} from '@/api/types/workspace';
import type {CognitiveAgent, CreateCognitiveAgentRequest} from '@/api/types/cognitive-agent';
import type {MAS, CreateMASRequest} from '@/api/types/mas';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

function hasStatus(error: unknown): error is {status: number} {
  return typeof error === 'object' && error !== null && 'status' in error && typeof (error as {status: unknown}).status === 'number';
}

export function useWorkspaces() {
  const {data, error, isLoading, mutate} = useSWR<ListWorkspacesResponse>(swrKeys.workspaces(), () => workspaceApi.list(), {
    revalidateOnMount: true,
    keepPreviousData: true
  });

  return {
    workspaces: sortByCreatedAtDesc(data?.workspaces || []),
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useWorkspace(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR<Workspace | null>(workspaceId ? swrKeys.workspace(workspaceId) : null, async () => {
    try {
      return await workspaceApi.get(workspaceId);
    } catch (e) {
      const list = await workspaceApi.list();
      const found = list.workspaces.find((w) => w.id === workspaceId);
      if (!found) {
        throw e;
      }
      return found;
    }
  });

  return {
    workspace: data || null,
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useApiKeys() {
  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    mutate
  } = useSWR(swrKeys.apiKeys(), () => apiKeyApi.list(), {
    revalidateOnMount: true,
    keepPreviousData: true
  });
  const {data: rolesData, isLoading: rolesLoading, error: rolesError, mutate: mutateRoles} = useSWR(swrKeys.iamRoles(), () => apiKeyApi.roles());
  const {data: usersData, isLoading: usersLoading, error: usersError, mutate: mutateUsers} = useSWR(swrKeys.iamUsers(), () => apiKeyApi.users());

  const {run: generateApiKey} = useInvalidateMutation(swrKeys.apiKeys(), (payload: {name: string}) => apiKeyApi.create(payload));

  const {run: runDeleteApiKey} = useInvalidateMutation(swrKeys.apiKeys(), (id: string) => apiKeyApi.delete(id));

  const deleteApiKey = async (id: string) => {
    await mutate(
      async (current) => {
        await runDeleteApiKey(id);
        return {
          api_keys: (current?.api_keys || []).filter((key) => key.id !== id),
          total: Math.max((current?.total || 1) - 1, 0)
        };
      },
      {
        optimisticData: (current) => ({
          api_keys: (current?.api_keys || []).filter((key) => key.id !== id),
          total: Math.max((current?.total || 1) - 1, 0)
        }),
        rollbackOnError: true,
        revalidate: false
      }
    );
  };

  const rawError = rolesError || usersError || listError;
  const normalizedError = rawError && hasStatus(rawError) && rawError.status === 404 ? null : rawError ? parseError(rawError) : null;

  return {
    apiKeys: sortByCreatedAtDesc(listData?.api_keys || []),
    total: listData?.total || 0,
    roles: rolesData?.roles || [],
    users: usersData?.users || [],
    isLoading: rolesLoading || usersLoading || listLoading,
    error: normalizedError,
    mutate,
    mutateRoles,
    mutateUsers,
    generateApiKey,
    deleteApiKey
  };
}

export function useSoftwareTemplates(templateType: 'ReasonerTemplates') {
  const {data, error, isLoading, mutate} = useSWR(swrKeys.softwareTemplates(templateType), () => softwareApi.listByType(templateType));

  return {
    templates: Array.isArray(data) ? data : [],
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useCognitiveAgents(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitiveAgent[]>(
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

  const {run: runDeleteCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    (cognitiveAgentId: string) => cognitiveAgentApi.delete(workspaceId, cognitiveAgentId)
  );

  const deleteCognitiveAgent = async (cognitiveAgentId: string) => {
    const prev = Array.isArray(data) ? data : [];
    await mutate(
      prev.filter((r) => r.id !== cognitiveAgentId),
      {revalidate: false}
    );
    try {
      await runDeleteCognitiveAgent(cognitiveAgentId);
    } catch (e) {
      await mutate(prev, {revalidate: false});
      throw e;
    }
  };

  return {
    cognitiveAgents: sortByCreatedAtDesc(Array.isArray(data) ? data : []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addCognitiveAgent,
    deleteCognitiveAgent
  } as const;
}

export function useMAS(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<MAS[]>(
    workspaceId ? swrKeys.mas(workspaceId) : null,
    () => masApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddMAS} = useInvalidateMutation(
    {keys: swrKeys.mas(workspaceId), prefixes: [['mas-list', workspaceId]]},
    (payload: CreateMASRequest) => masApi.create(workspaceId, payload)
  );

  const addMAS = async (payload: CreateMASRequest) => {
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
