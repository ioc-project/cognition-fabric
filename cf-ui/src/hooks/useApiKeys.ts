'use client';

import useSWR from 'swr';
import {apiKeyApi} from '@/api/endpoints';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';
import type {ListApiKeysResponse} from '@/api/types';

function hasStatus(error: unknown): error is {status: number} {
  return typeof error === 'object' && error !== null && 'status' in error && typeof (error as {status: unknown}).status === 'number';
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

  const {run: generateApiKey} = useInvalidateMutation(swrKeys.apiKeys(), (payload: {name: string}) => apiKeyApi.create({key_name: payload.name}));

  const {run: runDeleteApiKey} = useInvalidateMutation(swrKeys.apiKeys(), (id: string) => apiKeyApi.delete(id));

  const deleteApiKey = async (id: string) => {
    await mutate(
      async (current: ListApiKeysResponse | undefined) => {
        await runDeleteApiKey(id);
        return {
          api_keys: (current?.api_keys || []).filter((key) => key.id !== id),
          total: Math.max((current?.total || 1) - 1, 0)
        };
      },
      {
        optimisticData: (current: ListApiKeysResponse | undefined) => ({
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
