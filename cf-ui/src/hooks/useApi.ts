'use client';

import useSWR from 'swr';
import {workspaceApi, apiKeyApi, softwareApi, reasonerApi, masApi, kepApi} from '@/api/endpoints';
import type {Workspace, ListWorkspacesResponse} from '@/api/types/workspace';
import type {CognitiveAgent, CreateCognitiveAgentRequest} from '@/api/types/cognitive-agent';
import type {MAS, CreateMASRequest} from '@/api/types/mas';
import type {KEP, CreateKEPRequest} from '@/api/types/kep';
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
  const {data: rolesData, isLoading: rolesLoading, error: rolesError, mutate: mutateRoles} = useSWR('iam-roles', () => apiKeyApi.roles());
  const {data: usersData, isLoading: usersLoading, error: usersError, mutate: mutateUsers} = useSWR('iam-users', () => apiKeyApi.users());

  const {run: generateApiKey} = useInvalidateMutation('iam-create-api-key', (payload: {name: string; roles: string[]}) => apiKeyApi.create(payload));

  const rawError = rolesError || usersError;
  const normalizedError = rawError && hasStatus(rawError) && rawError.status === 404 ? null : rawError ? parseError(rawError) : null;

  return {
    roles: rolesData?.roles || [],
    users: usersData?.users || [],
    isLoading: rolesLoading || usersLoading,
    error: normalizedError,
    mutateRoles,
    mutateUsers,
    generateApiKey
  };
}

export function useSoftwareTemplates(templateType: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates') {
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
    () => reasonerApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    (payload: CreateCognitiveAgentRequest) => reasonerApi.create(workspaceId, payload)
  );

  const addCognitiveAgent = async (payload: CreateCognitiveAgentRequest) => {
    const response = await runAddCognitiveAgent(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    (cognitiveAgentId: string) => reasonerApi.delete(workspaceId, cognitiveAgentId)
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

export function useKEPs(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<KEP[]>(
    workspaceId ? swrKeys.keps(workspaceId) : null,
    () => kepApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddKEP} = useInvalidateMutation(
    {keys: swrKeys.keps(workspaceId), prefixes: [['kep-list', workspaceId]]},
    (payload: CreateKEPRequest) => kepApi.create(workspaceId, payload)
  );

  const addKEP = async (payload: CreateKEPRequest) => {
    const response = await runAddKEP(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteKEP} = useInvalidateMutation({keys: swrKeys.keps(workspaceId), prefixes: [['kep-list', workspaceId]]}, (kepId: string) =>
    kepApi.delete(workspaceId, kepId)
  );

  const deleteKnowledgeAdapters = async (kepId: string) => {
    const prev = Array.isArray(data) ? data : [];
    await mutate(
      prev.filter((k) => k.id !== kepId),
      {revalidate: false}
    );
    try {
      await runDeleteKEP(kepId);
    } catch (e) {
      await mutate(prev, {revalidate: false});
      throw e;
    }
  };

  return {
    knowledgeAdapters: sortByCreatedAtDesc(Array.isArray(data) ? data : []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addKEP,
    deleteKnowledgeAdapters
  } as const;
}
