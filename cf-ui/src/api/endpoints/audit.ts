import {getApiConfig} from '../config';
import {getSession} from 'next-auth/react';

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

export interface AuditEvent {
  id: string;
  operation_id?: string;
  resource_type: string;
  resource_identifier: string;
  audit_type: string;
  audit_resource_identifier: string;
  audit_information?: AuditInformation;
  audit_extra_information?: string;
  created_by: string;
  created_on: string;
  last_modified_by: string;
  last_modified_on: string;
}

export interface AuditEventListResponse {
  total: number;
  audit_events: AuditEvent[];
}

export interface AuditEventFilters {
  skip?: number;
  limit?: number;
  resource_type?: string;
  audit_type?: string;
}

async function fetchWithAuth(url: string): Promise<Response> {
  const config = getApiConfig();
  const session = await getSession();

  const headers: HeadersInit = {
    ...config.headers
  };

  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }

  const fullUrl = `${config.baseUrl}${url}`;
  return fetch(fullUrl, {headers});
}

export const auditApi = {
  list: async (filters?: AuditEventFilters): Promise<AuditEventListResponse> => {
    const params = new URLSearchParams();

    if (filters?.skip !== undefined) {
      params.append('skip', String(filters.skip));
    }
    if (filters?.limit !== undefined) {
      params.append('limit', String(filters.limit));
    }
    if (filters?.resource_type) {
      params.append('resource_type', filters.resource_type);
    }
    if (filters?.audit_type) {
      params.append('audit_type', filters.audit_type);
    }

    const queryString = params.toString();
    const url = `/api/audit-events/${queryString ? `?${queryString}` : ''}`;

    const response = await fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch audit events: ${response.statusText}`);
    }

    return response.json();
  },

  get: async (auditEventId: string): Promise<AuditEvent> => {
    const response = await fetchWithAuth(`/api/audit-events/${auditEventId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch audit event: ${response.statusText}`);
    }

    return response.json();
  }
};
