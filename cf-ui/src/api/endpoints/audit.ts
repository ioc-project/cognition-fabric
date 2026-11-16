// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {fetchAPI} from '../client';
import type {components} from '../generated/schema';

export type AuditEvent = components['schemas']['AuditCfnEventResponse'];
export type AuditPageInfo = components['schemas']['AuditCfnPageInfo'];
export type AuditEventListResponse = components['schemas']['AuditCfnEventListResponse'];

export interface AuditCEResponse {
  denial_reason?: string;
  missing_context_cause?: string;
  context_sufficiency?: string;
  timestamp?: string;
  trace_id?: string;
  checks_run?: Array<{check_id: string; passed: boolean}>;
  details?: Record<string, unknown>;
}

export interface CFNDispositionInformation {
  action?: 'get_disposition';
  mas_id?: string;
  source_agent_id?: string;
  destination_agent_id?: string;
  trace_id?: string;
  span_id?: string;
  ce_name?: string;
  ce_version?: string;
  ce_invoked?: boolean;
  outcome?: string;
  reason?: string;
  grpc_status?: string;
  returned_action?: string;
  returned_modify?: boolean;
  failure_category?: string;
  eligibility_counts?: {disabled: number; offline: number; no_enforcing_endpoint: number};
  ce_response?: AuditCEResponse;
  // Historical records retain their original JSON key.
  ce_details?: AuditCEResponse;
  truncated_fields?: string[];
}

export interface AuditInformation extends CFNDispositionInformation {
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

export type AuditDecisionFilter = 'allow' | 'block' | 'modify';
export type AuditOutcomeFilter = 'ALLOW' | 'BLOCK' | 'MODIFY_REQUESTED' | 'ERROR' | 'DEGRADED' | 'UNSUPPORTED' | 'UNKNOWN';

export interface AuditEventFilters {
  page?: number;
  pageSize?: number;
  resource_type?: string;
  audit_type?: string;
  decision?: AuditDecisionFilter;
  outcome?: AuditOutcomeFilter;
  success?: boolean;
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
    if (filters?.decision) {
      params.append('decision', filters.decision);
    }
    if (filters?.outcome) {
      params.append('outcome', filters.outcome);
    }
    if (filters?.success !== undefined) {
      params.append('success', String(filters.success));
    }

    const queryString = params.toString();
    const url = `/api/audit-events/${queryString ? `?${queryString}` : ''}`;

    return fetchAPI<AuditEventListResponse>(url);
  },

  get: async (auditEventId: string): Promise<AuditEvent> => {
    return fetchAPI<AuditEvent>(`/api/audit-events/${auditEventId}`);
  }
};
