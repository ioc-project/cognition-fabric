import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import {auditApi, type AuditEventFilters, type AuditEventListResponse} from '@/api/endpoints/audit';

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

export function useAuditEvents(filters?: Omit<AuditEventFilters, 'page' | 'pageSize'>, pageSize = DEFAULT_PAGE_SIZE) {
  const filtersKey = filters ? JSON.stringify(filters) : null;

  const {data, error, isLoading, size, setSize, mutate} = useSWRInfinite(
    (pageIndex: number, previousPageData: AuditEventListResponse | null) => {
      if (!filtersKey) {
        return null;
      }
      if (previousPageData && previousPageData.pageInfo.pageCount < pageSize) {
        return null;
      }
      return ['audit-events', filtersKey, pageIndex, pageSize];
    },
    async ([, , pageIndex]: [string, string, number]) => {
      return auditApi.list({...filters, page: pageIndex, pageSize});
    },
    {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      dedupingInterval: 30000
    }
  );

  const auditEvents = data?.flatMap((d) => d.data) ?? [];
  const totalElements = data?.[0]?.pageInfo.totalElements ?? 0;
  const hasMore = auditEvents.length < totalElements;
  const isLoadingMore = isLoading || (size > 0 && data !== undefined && typeof data[size - 1] === 'undefined');

  return {
    auditEvents,
    total: totalElements,
    hasMore,
    loadMore: () => setSize(size + 1),
    reset: () => setSize(1),
    mutate,
    isLoading: isLoadingMore,
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
