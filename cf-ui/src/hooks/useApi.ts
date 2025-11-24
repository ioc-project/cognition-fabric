'use client';

import {useCallback} from 'react';
import useSWR from 'swr';
import {workspaceApi, userApi, apiKeyApi, softwareApi} from '@/api';
import type {Workspace, User, ApiKey, Software} from '@/api/types';
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
  const {data, isLoading, mutate} = useSWR(workspaceId ? swrKeys.users(workspaceId) : null, () => userApi.list(workspaceId).catch(() => []));

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
    error,
    mutate,
    addUser,
    removeUser
  };
}

export function useApiKeys(workspaceId: string) {
  const {error, withErrorHandler} = useErrorHandler();
  const {data, isLoading, mutate} = useSWR(workspaceId ? swrKeys.apiKeys(workspaceId) : null, () =>
    apiKeyApi.list(workspaceId).catch(() => ({api_keys: [], total: 0}))
  );

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
    error,
    mutate,
    generateApiKey,
    deleteApiKey
  };
}

export function useSoftware(workspaceId: string) {
  const {error, withErrorHandler} = useErrorHandler();
  const {data, isLoading, mutate} = useSWR(workspaceId ? swrKeys.software(workspaceId) : null, () =>
    softwareApi.list(workspaceId).catch(() => ({softwares: [], total: 0}))
  );

  const addSoftware = useCallback(
    async (data: {name: string; type: string; config: {reasoning_engine: string; endpoint_url: string; timeout: number; max_retries: number}}) => {
      const result = await withErrorHandler(() => softwareApi.create(workspaceId, data), 'Failed to add software');
      if (result.success) await mutate();
      return result;
    },
    [workspaceId, mutate, withErrorHandler]
  );

  const updateSoftware = useCallback(
    async (softwareId: string, data: {name: string}) => {
      const result = await withErrorHandler(() => softwareApi.update(workspaceId, softwareId, data), 'Failed to update software');
      if (result.success) await mutate();
      return result;
    },
    [workspaceId, mutate, withErrorHandler]
  );

  const removeSoftware = useCallback(
    async (softwareId: string) => {
      const result = await withErrorHandler(() => softwareApi.delete(workspaceId, softwareId), 'Failed to remove software');
      if (result.success) await mutate();
      return result;
    },
    [workspaceId, mutate, withErrorHandler]
  );

  return {
    software: data?.softwares || [],
    isLoading,
    error,
    mutate,
    addSoftware,
    updateSoftware,
    removeSoftware
  };
}
