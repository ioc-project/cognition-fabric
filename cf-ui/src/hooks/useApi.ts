'use client';

import useSWR from 'swr';
import {workspaceApi, apiKeyApi, softwareApi, reasonerApi, masApi, kepApi} from '@/api/endpoints';
import type {Workspace, ListWorkspacesResponse} from '@/api/types/workspace';
import type {Reasoner, CreateReasonerRequest} from '@/api/types/reasoner';
import type {MAS, CreateMASRequest} from '@/api/types/mas';
import type {KEP, CreateKEPRequest} from '@/api/types/kep';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

function hasStatus(error: unknown): error is {status: number} {
  return typeof error === 'object' && error !== null && 'status' in error && typeof (error as {status: unknown}).status === 'number';
}

export function useWorkspaces() {
  const {data, error, isLoading, mutate} = useSWR<ListWorkspacesResponse>(swrKeys.workspaces(), () => workspaceApi.list(), {
    revalidateOnMount: true,
    dedupingInterval: 0
  });

  return {
    workspaces: data?.workspaces || [],
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

export function useReasoners(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<Reasoner[]>(
    workspaceId ? swrKeys.reasoners(workspaceId) : null,
    () => reasonerApi.list(workspaceId),
    {revalidateOnMount: true, dedupingInterval: 0}
  );

  const {run: addReasoner} = useInvalidateMutation(
    {keys: swrKeys.reasoners(workspaceId), prefixes: [['reasoners', workspaceId]]},
    (payload: CreateReasonerRequest) => reasonerApi.create(workspaceId, payload)
  );

  const {run: runDeleteReasoner} = useInvalidateMutation(
    {keys: swrKeys.reasoners(workspaceId), prefixes: [['reasoners', workspaceId]]},
    (reasonerId: string) => reasonerApi.delete(workspaceId, reasonerId)
  );

  const deleteReasoner = async (reasonerId: string) => {
    const prev = Array.isArray(data) ? data : [];
    await mutate(
      prev.filter((r) => r.id !== reasonerId),
      {revalidate: false}
    );
    try {
      await runDeleteReasoner(reasonerId);
    } catch (e) {
      await mutate(prev, {revalidate: false});
      throw e;
    }
  };

  return {
    reasoners: Array.isArray(data) ? data : [],
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addReasoner,
    deleteReasoner
  } as const;
}

export function useMAS(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<MAS[]>(
    workspaceId ? swrKeys.mas(workspaceId) : null,
    () => masApi.list(workspaceId),
    {revalidateOnMount: true, dedupingInterval: 0}
  );

  const {run: runAddMAS} = useInvalidateMutation(
    {keys: swrKeys.mas(workspaceId), prefixes: [['mas-list', workspaceId]]},
    (payload: CreateMASRequest) => masApi.create(workspaceId, payload)
  );

  const addMAS = async (payload: CreateMASRequest) => {
    await runAddMAS(payload);
    await mutate(undefined, {revalidate: true});
    return {} as MAS;
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
    masList: Array.isArray(data) ? data : [],
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
    {revalidateOnMount: true, dedupingInterval: 0}
  );

  const {run: addKEP} = useInvalidateMutation({keys: swrKeys.keps(workspaceId), prefixes: [['kep-list', workspaceId]]}, (payload: CreateKEPRequest) =>
    kepApi.create(workspaceId, payload)
  );

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
    knowledgeAdapters: Array.isArray(data) ? data : [],
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addKEP,
    deleteKnowledgeAdapters
  } as const;
}
