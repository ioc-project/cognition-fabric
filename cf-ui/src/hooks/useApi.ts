'use client';

import {useCallback} from 'react';
import useSWR from 'swr';
import {workspaceApi, userApi, apiKeyApi, softwareApi, softwareTemplatesApi} from '@/api';
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
  const {data, isLoading, mutate} = useSWR(workspaceId ? swrKeys.workspace(workspaceId) : null, () => workspaceApi.get(workspaceId));

  return {
    workspace: data || null,
    isLoading,
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

export function useApiKeys(workspaceId: string) {
  const {data, isLoading, error, mutate} = useSWRResource(workspaceId ? swrKeys.apiKeys(workspaceId) : null, () => apiKeyApi.list(workspaceId));

  const {run: generateApiKey} = useInvalidateMutation(swrKeys.apiKeys(workspaceId), () => apiKeyApi.create(workspaceId));
  const {run: deleteApiKey} = useInvalidateMutation(swrKeys.apiKeys(workspaceId), (keyId: string) => apiKeyApi.delete(workspaceId, keyId));

  return {
    apiKeys: data?.api_keys || [],
    isLoading,
    error,
    mutate,
    generateApiKey,
    deleteApiKey
  };
}

export function useSoftware(workspaceId: string) {
  const {data, error: swrError, isLoading, mutate} = useSWR(workspaceId ? swrKeys.software(workspaceId) : null, () => softwareApi.list(workspaceId));

  return {
    software: data?.softwares || [],
    isLoading,
    error: swrError ? parseError(swrError) : null,
    mutate
  };
}

export function useSoftwareTemplates() {
  const {data, error, isLoading, mutate} = useSWR(swrKeys.softwareTemplates(), () => softwareTemplatesApi.list());
  return {
    templates: (data?.softwares || []) as ListSoftwareTemplatesResponse['softwares'],
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}
