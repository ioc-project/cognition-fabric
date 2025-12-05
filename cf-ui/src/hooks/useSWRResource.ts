'use client';

import useSWR, {type Key, useSWRConfig} from 'swr';
import {parseError} from '@/lib/utils';

export function useSWRResource<TData>(key: Key | null, fetcher: () => Promise<TData>) {
  const {data, error, isLoading, mutate} = useSWR<TData>(key, fetcher);
  return {
    data: (data ?? null) as TData | null,
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  } as const;
}

export function useInvalidateMutation<TArgs extends any[], TResult>(keys: Key | Key[], fn: (...args: TArgs) => Promise<TResult>) {
  const {mutate} = useSWRConfig();
  const run = async (...args: TArgs) => {
    const res = await fn(...args);
    await mutate(keys);
    return res;
  };
  return {run} as const;
}
