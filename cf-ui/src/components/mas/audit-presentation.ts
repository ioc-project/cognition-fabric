// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import type {AuditEvent, AuditInformation, AuditOutcomeFilter} from '@/api/endpoints/audit';

export type AuditOutcomeType = 'allow' | 'deny' | 'modify' | 'error' | 'degraded' | 'unsupported' | 'unknown' | 'other';

export const auditTypeOptions = [
  {value: 'CE_INVOKED', label: 'CE Invoked'},
  {value: 'CE_NOT_INVOKED', label: 'CE Not Invoked'},
  {value: 'PROXY_MEDIATED', label: 'Proxy Mediated'}
];

export const outcomeLabels: Record<AuditOutcomeFilter, string> = {
  ALLOW: 'Allow',
  BLOCK: 'Block',
  MODIFY_REQUESTED: 'Modify requested',
  ERROR: 'Error',
  DEGRADED: 'Degraded',
  UNSUPPORTED: 'Unsupported',
  UNKNOWN: 'Unknown'
};

export const auditOutcomeLabels: Record<AuditOutcomeType, string> = {
  allow: outcomeLabels.ALLOW,
  deny: outcomeLabels.BLOCK,
  modify: outcomeLabels.MODIFY_REQUESTED,
  error: outcomeLabels.ERROR,
  degraded: outcomeLabels.DEGRADED,
  unsupported: outcomeLabels.UNSUPPORTED,
  unknown: outcomeLabels.UNKNOWN,
  other: 'Other'
};

export function isCfnDispositionEvent(event: AuditEvent): boolean {
  return (
    event.source === 'CFN' &&
    event.resource_type === 'COGNITION_ENGINE' &&
    (event.audit_type === 'CE_INVOKED' || event.audit_type === 'CE_NOT_INVOKED')
  );
}

export function isProxyAuditEvent(event: AuditEvent): boolean {
  return event.source === 'PROXY' && event.resource_type === 'ENFORCEMENT_PROXY' && event.audit_type === 'PROXY_MEDIATED';
}

export function getAuditActorName(event: AuditEvent): string | undefined {
  if (isCfnDispositionEvent(event)) {
    const name = event.audit_information?.ce_name;
    return typeof name === 'string' ? name.trim() || undefined : undefined;
  }
  return isProxyAuditEvent(event) ? 'proxy' : event.source || 'Source unavailable';
}

export function getAuditTraceId(event: AuditEvent): string | null {
  const info = event.audit_information as AuditInformation | null | undefined;
  const traceId = info?.trace_id;
  const truncated = Array.isArray(info?.truncated_fields) && info.truncated_fields.includes('trace_id');
  return typeof traceId === 'string' && traceId.trim() && !truncated ? traceId : null;
}

export function auditEventMatchesMas(event: AuditEvent, masId: string, agentIds: ReadonlySet<string>, selectedAgent: string | null): boolean {
  const info = event.audit_information as AuditInformation | null | undefined;
  if (event.resource_type === 'MAS') {
    return event.audit_resource_identifier === masId || event.audit_information?.id === masId || event.resource_identifier === masId;
  }
  if (event.resource_type === 'MAS-AGENT') {
    if (selectedAgent) {
      return event.resource_identifier === selectedAgent;
    }
    if (info?.request?.http_request_body?.mas_id === masId) {
      return true;
    }
    return agentIds.has(event.resource_identifier);
  }
  if (isProxyAuditEvent(event)) {
    return event.audit_resource_identifier === masId || (!event.audit_resource_identifier && event.audit_information?.mas_id === masId);
  }
  return event.resource_type === 'COGNITION_ENGINE' && event.audit_resource_identifier === masId;
}

function legacyOutcome(event: AuditEvent): string | null {
  const info = event.audit_information;
  if (isCfnDispositionEvent(event)) {
    if (event.success === false || info?.outcome === 'ERROR') {
      return 'ERROR';
    }
    switch (info?.outcome) {
      case 'DECISION_ALLOW':
        return 'ALLOW';
      case 'DECISION_DENY':
        return 'BLOCK';
      case 'DECISION_MODIFY':
        return 'MODIFY_REQUESTED';
      default:
        return 'UNKNOWN';
    }
  }
  if (isProxyAuditEvent(event)) {
    switch (info?.applied_outcome) {
      case 'APPLIED_OUTCOME_ALLOWED':
      case 'ALLOWED':
        return 'ALLOW';
      case 'APPLIED_OUTCOME_BLOCKED':
      case 'BLOCKED':
        return 'BLOCK';
      case 'APPLIED_OUTCOME_DEGRADED':
      case 'DEGRADED':
        return 'DEGRADED';
      case 'APPLIED_OUTCOME_UNSUPPORTED':
      case 'UNSUPPORTED':
        return 'UNSUPPORTED';
      default:
        return 'UNKNOWN';
    }
  }
  return null;
}

export function getAuditOutcome(event: AuditEvent): AuditOutcomeType {
  const outcome = event.outcome ?? legacyOutcome(event);
  switch (outcome) {
    case 'ALLOW':
      return 'allow';
    case 'BLOCK':
      return 'deny';
    case 'MODIFY_REQUESTED':
      return 'modify';
    case 'ERROR':
      return 'error';
    case 'DEGRADED':
      return 'degraded';
    case 'UNSUPPORTED':
      return 'unsupported';
    case 'UNKNOWN':
      return 'unknown';
    default:
      return outcome ? 'unknown' : 'other';
  }
}

export function getAuditOutcomeLabel(event: AuditEvent): string {
  return auditOutcomeLabels[getAuditOutcome(event)];
}
