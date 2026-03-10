import useSWR from 'swr';
import {auditApi, type AuditEventFilters} from '@/api/endpoints/audit';

export function useAuditEvents(filters?: AuditEventFilters) {
  const key = filters ? ['audit-events', JSON.stringify(filters)] : null;

  const {data, error, isLoading, mutate} = useSWR(
    key,
    async () => {
      if (!filters) {
        return null;
      }
      return auditApi.list(filters);
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000 // 30 seconds
    }
  );

  return {
    auditEvents: data?.audit_events || [],
    total: data?.total || 0,
    isLoading,
    error,
    mutate
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
