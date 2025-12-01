'use client';

import {useCallback} from 'react';
import useSWR from 'swr';
import {workspaceApi, userApi, apiKeyApi, softwareApi, softwareTemplatesApi} from '@/api';
import type {ListSoftwareTemplatesResponse} from '@/api/types';
import {swrKeys} from '@/lib/swr-config';
import {parseError} from '@/lib/utils';
import {useErrorHandler} from './useErrorHandler';

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
  const {error, withErrorHandler} = useErrorHandler();
  const {data, error: swrError, isLoading, mutate} = useSWR(workspaceId ? swrKeys.users(workspaceId) : null, () => userApi.list(workspaceId));

  const addUser = useCallback(
    async (data: {name: string; email: string}) => {
      const result = await withErrorHandler(() => userApi.create(workspaceId, {name: data.name, email: data.email}), 'Failed to add user');
      if (result.success) await mutate();
      return result;
    },
    [workspaceId, mutate, withErrorHandler]
  );

  const removeUser = useCallback(
    async (userId: string) => {
      const result = await withErrorHandler(() => userApi.delete(workspaceId, userId), 'Failed to remove user');
      if (result.success) await mutate();
      return result;
    },
    [workspaceId, mutate, withErrorHandler]
  );

  return {
    users: Array.isArray(data) ? data : [],
    isLoading,
    error: swrError ? parseError(swrError) : error,
    mutate,
    addUser,
    removeUser
  };
}

export function useApiKeys(workspaceId: string) {
  const {error, withErrorHandler} = useErrorHandler();
  const {data, error: swrError, isLoading, mutate} = useSWR(workspaceId ? swrKeys.apiKeys(workspaceId) : null, () => apiKeyApi.list(workspaceId));

  const generateApiKey = useCallback(async () => {
    const result = await withErrorHandler(() => apiKeyApi.create(workspaceId), 'Failed to generate API key');
    if (result.success) await mutate();
    return result;
  }, [workspaceId, mutate, withErrorHandler]);

  const deleteApiKey = useCallback(
    async (keyId: string) => {
      const result = await withErrorHandler(() => apiKeyApi.delete(workspaceId, keyId), 'Failed to delete API key');
      if (result.success) await mutate();
      return result;
    },
    [workspaceId, mutate, withErrorHandler]
  );

  return {
    apiKeys: data?.api_keys || [],
    isLoading,
    error: swrError ? parseError(swrError) : error,
    mutate,
    generateApiKey,
    deleteApiKey
  };
}

export function useSoftware(workspaceId: string) {
  const {error, withErrorHandler} = useErrorHandler();
  const {data, error: swrError, isLoading, mutate} = useSWR(workspaceId ? swrKeys.software(workspaceId) : null, () => softwareApi.list(workspaceId));

  return {
    software: data?.softwares || [],
    isLoading,
    error: swrError ? parseError(swrError) : error,
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
