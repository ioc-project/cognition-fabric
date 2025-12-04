'use client';

import useSWR from 'swr';
import {workspaceApi, userApi, apiKeyApi, softwareApi} from '@/api/endpoints';
import type {ListSoftwareTemplatesResponse} from '@/api/types';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {useInvalidateMutation, useSWRResource} from './useSWRResource';

export function useWorkspaces() {
  const {data, error: swrError, isLoading, mutate} = useSWR(swrKeys.workspaces(), () => workspaceApi.list());

  return {
    workspaces: data?.workspaces || [],
    isLoading,
    error: swrError ? parseError(swrError) : null,
    mutate
  };
}

export function useWorkspace(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR(workspaceId ? swrKeys.workspace(workspaceId) : null, async () => {
    try {
      return await workspaceApi.get(workspaceId);
    } catch (e) {
      const list = await workspaceApi.list();
      const found = list.workspaces.find((w) => w.id === workspaceId);
      if (!found) throw e;
      return found;
    }
  });

  return {
    workspace: (data as any) || null,
    isLoading,
    error: error ? parseError(error as Error) : null,
    mutate
  };
}

export function useUsers(workspaceId: string) {
  const {data, isLoading, error, mutate} = useSWRResource(workspaceId ? swrKeys.users(workspaceId) : null, () => userApi.list(workspaceId));

  const {run: addUser} = useInvalidateMutation(swrKeys.users(workspaceId), (payload: {name: string; email: string}) =>
    userApi.create(workspaceId, {name: payload.name, email: payload.email})
  );
  const {run: removeUser} = useInvalidateMutation(swrKeys.users(workspaceId), (userId: string) => userApi.delete(workspaceId, userId));

  return {
    users: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
    addUser,
    removeUser
  };
}

export function useApiKeys() {
  const {data: rolesData, isLoading: rolesLoading, error: rolesError, mutate: mutateRoles} = useSWR('iam-roles', () => apiKeyApi.roles());
  const {data: usersData, isLoading: usersLoading, error: usersError, mutate: mutateUsers} = useSWR('iam-users', () => apiKeyApi.users());

  const {run: generateApiKey} = useInvalidateMutation('iam-create-api-key', (payload: {name: string; roles: string[]}) =>
    apiKeyApi.create({name: payload.name, roles: payload.roles})
  );

  const rawError = (rolesError || usersError) as unknown as {status?: number} | null;
  const normalizedError = rawError ? (rawError.status === 404 ? null : parseError(rawError as unknown as Error)) : null;

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
    templates: (Array.isArray(data) ? data : []) as ListSoftwareTemplatesResponse,
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}
