// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import useSWR, {type Key, useSWRConfig} from 'swr';
import {parseError} from '@/lib/utils';

export function useSWRResource<TData>(key: Key | null, fetcher: () => Promise<TData>) {
  const {data, error, isLoading, mutate} = useSWR<TData>(key, fetcher, {
    revalidateOnMount: true,
    keepPreviousData: true,
    dedupingInterval: 0 // Always fetch fresh data on mount
  });
  return {
    data: (data ?? null) as TData | null,
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  } as const;
}

type InvalidateConfig = {
  keys?: Key | Key[];
  prefixes?: ReadonlyArray<ReadonlyArray<unknown>>;
};

function keyStartsWith(cacheKey: unknown, prefix: ReadonlyArray<unknown>): boolean {
  if (!Array.isArray(cacheKey)) {
    return false;
  }
  if (cacheKey.length < prefix.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i++) {
    if (cacheKey[i] !== prefix[i]) {
      return false;
    }
  }
  return true;
}

export function useInvalidateMutation<TArgs extends unknown[], TResult>(
  keysOrConfig: Key | Key[] | InvalidateConfig,
  fn: (...args: TArgs) => Promise<TResult>
) {
  const {mutate} = useSWRConfig();
  const run = async (...args: TArgs) => {
    const res = await fn(...args);

    const cfg: InvalidateConfig =
      Array.isArray(keysOrConfig) || (keysOrConfig as unknown as any)?.toString
        ? {keys: keysOrConfig as Key | Key[]}
        : (keysOrConfig as InvalidateConfig);

    if (cfg?.keys) {
      await mutate(cfg.keys, undefined, {revalidate: true});
    }

    if (cfg?.prefixes && cfg.prefixes.length) {
      await Promise.all(cfg.prefixes.map((p) => mutate((k) => keyStartsWith(k, p), undefined, {revalidate: true})));
    }

    return res;
  };
  return {run} as const;
}
