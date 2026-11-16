// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {useCallback, useEffect, useRef} from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import {getApiConfig} from '@/api/config';
import {auditApi, type AuditEvent, type AuditEventFilters, type AuditEventListResponse} from '@/api/endpoints/audit';

export function useAuditEventsPage(filters?: Omit<AuditEventFilters, 'page' | 'pageSize'>, page = 0, pageSize = 20) {
  const {data, error, isLoading} = useSWR(
    filters !== undefined ? ['audit-events-page', JSON.stringify(filters), page, pageSize] : null,
    async () => auditApi.list({...filters, page, pageSize}),
    {revalidateOnFocus: false, dedupingInterval: 30000}
  );

  const totalElements = data?.pageInfo.totalElements ?? 0;
  const totalPages = Math.ceil(totalElements / pageSize);

  return {
    auditEvents: data?.data ?? [],
    totalElements,
    totalPages,
    isLoading,
    error
  };
}

const DEFAULT_PAGE_SIZE = 20;

export function useAuditEvents(
  filters?: Omit<AuditEventFilters, 'page' | 'pageSize'>,
  {pageSize = DEFAULT_PAGE_SIZE, onIncomingEvents}: {pageSize?: number; onIncomingEvents?: (events: AuditEvent[]) => void} = {}
) {
  const filtersKey = filters ? JSON.stringify(filters) : null;
  const refreshIntervalMs = filtersKey ? getApiConfig().auditRefreshIntervalMs : 0;
  const incomingCallback = useRef(onIncomingEvents);
  const seenEvents = useRef<{key: string | null; ids: Set<string>; pendingIds: Set<string>; pageCount: number}>({
    key: filtersKey,
    ids: new Set(),
    pendingIds: new Set(),
    pageCount: 0
  });
  const activePoll = useRef<{key: string; pageCount: number} | null>(null);

  useEffect(() => {
    incomingCallback.current = onIncomingEvents;
  }, [onIncomingEvents]);

  const {data, error, isLoading, isValidating, size, setSize, mutate} = useSWRInfinite(
    (pageIndex: number, previousPageData: AuditEventListResponse | null) => {
      if (!filtersKey) {
        return null;
      }
      if (previousPageData && previousPageData.pageInfo.pageCount < pageSize) {
        return null;
      }
      return ['audit-events', filtersKey, pageIndex, pageSize];
    },
    async ([, requestKey, pageIndex, requestPageSize]: [string, string, number, number]) => {
      // Bind each request to its cache key, including while the selected filters change.
      const requestFilters = JSON.parse(requestKey) as Omit<AuditEventFilters, 'page' | 'pageSize'>;
      const poll = activePoll.current;
      const isPolledPage = poll?.key === requestKey && pageIndex < poll.pageCount;
      const result = await auditApi.list({...requestFilters, page: pageIndex, pageSize: requestPageSize});
      const seen = seenEvents.current;
      if (seen.key === requestKey) {
        for (const event of result.data) {
          // Retain incoming IDs through partial refresh failures until their rows are visible.
          if (!seen.ids.has(event.id) && isPolledPage && activePoll.current === poll) {
            seen.pendingIds.add(event.id);
          }
          // Initial loads and new pagination pages seed the baseline without flashing.
          seen.ids.add(event.id);
        }
      }
      return result;
    },
    {
      // Refresh the entire loaded window: new rows shift offset-page boundaries.
      revalidateAll: true,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      // The loop below also retries after errors; SWR polling stops on cached errors.
      refreshInterval: 0,
      shouldRetryOnError: refreshIntervalMs === 0,
      dedupingInterval: 30_000
    }
  );

  const lastPage = data?.[data.length - 1];
  // A successful empty page is loaded data too, even if no rows match this MAS.
  const hasLoaded = data?.[0] !== undefined;
  const reachedEnd = lastPage !== undefined && lastPage.pageInfo.pageCount < pageSize;
  const hasPendingPage = hasLoaded && !reachedEnd && size > 0 && data?.[size - 1] === undefined;
  const isLoadingMore = isValidating && hasPendingPage;

  useEffect(() => {
    if (seenEvents.current.key !== filtersKey) {
      seenEvents.current = {key: filtersKey, ids: new Set(), pendingIds: new Set(), pageCount: 0};
    }
    const pages = data?.filter(Boolean) ?? [];
    seenEvents.current.pageCount = pages.length;
    for (const page of pages) {
      for (const event of page.data) {
        seenEvents.current.ids.add(event.id);
      }
    }
  }, [data, filtersKey]);

  useEffect(() => {
    const seen = seenEvents.current;
    if (!hasLoaded || error || isLoadingMore || seen.key !== filtersKey || seen.pendingIds.size === 0) {
      return;
    }
    // Start the cue only after SWR publishes the refreshed window and the table can render it.
    const incoming = new Map<string, AuditEvent>();
    for (const page of data ?? []) {
      for (const event of page.data) {
        if (seen.pendingIds.has(event.id)) {
          incoming.set(event.id, event);
        }
      }
    }
    // Drop pending IDs outside the published window so loading older pages stays quiet.
    seen.pendingIds.clear();
    if (incoming.size > 0) {
      incomingCallback.current?.([...incoming.values()]);
    }
  }, [data, error, filtersKey, hasLoaded, isLoadingMore]);

  useEffect(() => {
    if (!filtersKey || refreshIntervalMs === 0) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let poll: {key: string; pageCount: number} | null = null;
    const refresh = async () => {
      if (cancelled) {
        return;
      }
      if (!document.hidden && navigator.onLine !== false) {
        poll = {key: filtersKey, pageCount: seenEvents.current.key === filtersKey ? seenEvents.current.pageCount : 0};
        activePoll.current = poll;
        try {
          await mutate();
        } catch {
          // SWR exposes the error; keep retrying on the configured interval.
        } finally {
          if (activePoll.current === poll) {
            activePoll.current = null;
          }
          poll = null;
        }
      }
      if (!cancelled) {
        timer = setTimeout(refresh, refreshIntervalMs);
      }
    };
    timer = setTimeout(refresh, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (activePoll.current === poll) {
        activePoll.current = null;
      }
    };
  }, [filtersKey, refreshIntervalMs, mutate]);

  // Inserts between page reads can repeat a boundary row. Count each event once.
  const auditEvents = Array.from(new Map((data?.flatMap((d) => d.data) ?? []).map((event) => [event.id, event] as const)).values());
  const totalElements = data?.[0]?.pageInfo.totalElements ?? 0;
  const hasMore = !reachedEnd && auditEvents.length < totalElements;

  const retry = useCallback(async () => {
    try {
      await mutate();
    } catch {
      // SWR exposes the error while retaining the previously loaded window.
    }
  }, [mutate]);

  const loadMore = useCallback(async () => {
    if (isValidating) {
      return;
    }
    try {
      if (hasPendingPage) {
        // A failed page is still requested: retry it without asking for another page.
        await mutate();
      } else {
        await setSize((prev) => prev + 1);
      }
    } catch {
      // Keep the loaded rows and let the view offer a retry.
    }
  }, [hasPendingPage, isValidating, mutate, setSize]);

  const reset = useCallback(async () => {
    try {
      await setSize(1);
    } catch {
      // SWR exposes the error to the current view.
    }
  }, [setSize]);

  return {
    auditEvents,
    total: totalElements,
    hasMore,
    loadMore,
    reset,
    mutate,
    retry,
    hasLoaded,
    isLoading: !hasLoaded && isLoading,
    isLoadingMore,
    isValidating,
    error
  };
}

export function useAuditEvent(auditEventId?: string) {
  const {data, error, isLoading, mutate} = useSWR(
    auditEventId ? ['audit-event', auditEventId] : null,
    async () => {
      if (!auditEventId) {
        return null;
      }
      return auditApi.get(auditEventId);
    },
    {
      revalidateOnFocus: false
    }
  );

  return {
    auditEvent: data,
    isLoading,
    error,
    mutate
  };
}
