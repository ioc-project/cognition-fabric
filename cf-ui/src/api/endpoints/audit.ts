import {fetchAPI} from '../client';
import type {components} from '../generated/schema';

export type AuditEvent = components['schemas']['AuditCfnEventResponse'];
export type AuditPageInfo = components['schemas']['AuditCfnPageInfo'];
export type AuditEventListResponse = components['schemas']['AuditCfnEventListResponse'];

export interface AuditInformation {
  status?: string;
  http_status?: number;
  request?: {
    http_url?: string;
    http_method?: string;
    http_request_body?: Record<string, any>;
  };
  response?:
    | Record<string, any>
    | {
        raw?: string | any;
      };
  [key: string]: any;
}

export interface AuditEventFilters {
  page?: number;
  pageSize?: number;
  resource_type?: string;
  audit_type?: string;
}

export const auditApi = {
  list: async (filters?: AuditEventFilters): Promise<AuditEventListResponse> => {
    const params = new URLSearchParams();

    if (filters?.page !== undefined) {
      params.append('page', String(filters.page));
    }
    if (filters?.pageSize !== undefined) {
      params.append('pageSize', String(filters.pageSize));
    }
    if (filters?.resource_type) {
      params.append('resource_type', filters.resource_type);
    }
    if (filters?.audit_type) {
      params.append('audit_type', filters.audit_type);
    }

    const queryString = params.toString();
    const url = `/api/audit-events/${queryString ? `?${queryString}` : ''}`;

    return fetchAPI<AuditEventListResponse>(url);
  },

  get: async (auditEventId: string): Promise<AuditEvent> => {
    return fetchAPI<AuditEvent>(`/api/audit-events/${auditEventId}`);
  }
};
