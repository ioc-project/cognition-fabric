// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Fragment, useCallback, useEffect, useId, useMemo, useState, type ReactNode} from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  Copy,
  Edit,
  Plus,
  Trash2,
  TriangleAlert,
  User,
  History,
  X
} from 'lucide-react';
import {toast} from 'sonner';
import {useAuditEvents} from '@/hooks/useAuditEvents';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ActionButton} from '@/components/ui/action-button';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Switch} from '@/components/ui/switch';
import {InlineId} from '@/components/ui/inline-id';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {CollapsibleJsonField} from '@/components/mas/collapsible-json-field';
import {SyntaxJson} from '@/components/ui/syntax-json';
import {getApiConfig} from '@/api/config';
import type {AuditOutcomeFilter, AuditEvent, AuditInformation} from '@/api/endpoints/audit';
import {cn} from '@/lib/utils';
import {
  auditEventMatchesMas,
  auditOutcomeLabels,
  auditTypeOptions,
  getAuditActorName,
  getAuditTraceId,
  isCfnDispositionEvent,
  isProxyAuditEvent,
  getAuditOutcome,
  getAuditOutcomeLabel,
  outcomeLabels,
  type AuditOutcomeType
} from './audit-presentation';

interface MASAuditLogProps {
  masId: string;
  workspaceId: string;
  masName: string;
  agents?: Array<{agent_id: string; name?: string | null; [key: string]: any}>;
}

interface AgentChange {
  type: 'added' | 'removed' | 'modified';
  agentId: string;
  changes?: string[];
}

interface ParsedAuditEvent extends Omit<AuditEvent, 'audit_information'> {
  audit_information?: AuditInformation | null;
  agentChanges?: AgentChange[];
  masChanges?: string[];
}

interface AuditTraceGroup {
  key: string;
  traceId: string | null;
  events: ParsedAuditEvent[];
}

function formatAuditTimestamp(value: string, shortYear = false): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return 'N/A';
  }
  const pad = (part: number, length = 2) => String(part).padStart(length, '0');
  const year = pad(timestamp.getUTCFullYear(), 4);
  const date = `${pad(timestamp.getUTCMonth() + 1)}/${pad(timestamp.getUTCDate())}/${shortYear ? year.slice(-2) : year}`;
  const time = `${pad(timestamp.getUTCHours())}:${pad(timestamp.getUTCMinutes())}:${pad(timestamp.getUTCSeconds())}`;
  return `${date} ${time}`;
}

function AuditOutcome({outcome, label, count, title}: {outcome: AuditOutcomeType; label?: string; count?: number; title?: string}) {
  const outcomeLabel = label || auditOutcomeLabels[outcome];
  const iconClass = 'h-4 w-4 shrink-0';
  let icon: ReactNode;
  switch (outcome) {
    case 'allow':
      icon = <CircleCheck className={cn(iconClass, 'text-green-600')} aria-hidden="true" />;
      break;
    case 'deny':
      icon = <CircleMinus className={cn(iconClass, 'text-red-600')} aria-hidden="true" />;
      break;
    case 'modify':
      icon = (
        <svg
          className={cn(iconClass, 'text-amber-600')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m8 13-.5 3.5L11 16l6-6-3-3-6 6Z" />
          <path d="m13 8 3 3" />
        </svg>
      );
      break;
    case 'degraded':
      icon = <TriangleAlert className={cn(iconClass, 'text-amber-600')} aria-hidden="true" />;
      break;
    case 'unsupported':
      icon = <CircleMinus className={cn(iconClass, 'text-muted-foreground')} aria-hidden="true" />;
      break;
    case 'error':
      icon = <TriangleAlert className={cn(iconClass, 'text-red-600')} aria-hidden="true" />;
      break;
    default:
      icon = <CircleHelp className={cn(iconClass, 'text-muted-foreground')} aria-hidden="true" />;
  }

  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap text-xs text-[hsl(var(--foreground))]"
      title={title ? `${outcomeLabel}: ${title}` : outcomeLabel}
    >
      {icon}
      <span className="truncate">
        {outcomeLabel}
        {count !== undefined ? `: ${count}` : ''}
      </span>
    </span>
  );
}

function AuditEventTable({
  children,
  groupByTrace,
  hasTraceGroups,
  allTracesExpanded,
  onToggleAllTraces
}: {
  children: ReactNode;
  groupByTrace: boolean;
  hasTraceGroups: boolean;
  allTracesExpanded: boolean;
  onToggleAllTraces: () => void;
}) {
  const headerClass = 'sticky top-0 z-10 bg-[hsl(var(--card))] px-2 py-3 font-normal';

  return (
    <table className="w-[43.5rem] table-fixed text-left text-xs text-[hsl(var(--foreground))]" aria-label="Audit items">
      <colgroup>
        <col className={groupByTrace ? 'w-[10.5rem]' : 'w-[9rem]'} />
        {!groupByTrace && <col className="w-[7.5rem]" />}
        <col className={groupByTrace ? 'w-[7rem]' : 'w-[5rem]'} />
        <col className={groupByTrace ? 'w-[6rem]' : 'w-[5rem]'} />
        <col className={groupByTrace ? 'w-[8.5rem]' : 'w-[7rem]'} />
        <col className={groupByTrace ? 'w-[9.5rem]' : 'w-[8rem]'} />
        <col className="w-[2rem]" />
      </colgroup>
      <thead>
        <tr className="text-muted-foreground">
          <th scope="col" className={headerClass}>
            Timestamp (UTC)
          </th>
          {!groupByTrace && (
            <th scope="col" className={headerClass}>
              Trace ID
            </th>
          )}
          <th scope="col" className={headerClass}>
            Actor
          </th>
          <th scope="col" className={headerClass}>
            Outcome
          </th>
          <th scope="col" className={headerClass}>
            Source agent
          </th>
          <th scope="col" className={headerClass}>
            Destination agent
          </th>
          <th scope="col" className={cn(headerClass, 'px-1')}>
            {groupByTrace ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleAllTraces}
                disabled={!hasTraceGroups}
                className="h-6 w-6 p-0"
                aria-expanded={allTracesExpanded}
                aria-label={allTracesExpanded ? 'Collapse all trace groups' : 'Expand all trace groups'}
                title={allTracesExpanded ? 'Collapse all trace groups' : 'Expand all trace groups'}
              >
                {allTracesExpanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            ) : (
              <span className="sr-only">Details</span>
            )}
          </th>
        </tr>
      </thead>
      {children}
    </table>
  );
}

function AuditEventJson({event}: {event: ParsedAuditEvent}) {
  const code = JSON.stringify(event, null, 2);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
      toast.error('Could not copy audit JSON');
    }
  };

  return (
    <div className="relative rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] overflow-hidden [&_pre]:pr-12">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="absolute right-2 top-2 h-6 w-6 p-0"
        aria-label={copied ? 'Audit JSON copied' : 'Copy entire audit JSON'}
        title={copied ? 'Copied' : 'Copy entire audit JSON'}
      >
        {copied ? <Check className="h-4 w-4 text-black" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </Button>
      <SyntaxJson code={code} />
    </div>
  );
}

function AuditEventRow({
  event,
  expanded,
  onToggle,
  showTraceId = false,
  flashing = false
}: {
  event: ParsedAuditEvent;
  expanded: boolean;
  onToggle: () => void;
  showTraceId?: boolean;
  flashing?: boolean;
}) {
  const isCfnDisposition = isCfnDispositionEvent(event);
  const info = isCfnDisposition || isProxyAuditEvent(event) ? event.audit_information : undefined;
  const ceName = getAuditActorName(event);
  const ceId = isCfnDisposition ? event.resource_identifier : undefined;
  const outcome = getAuditOutcome(event);
  const outcomeLabel = getAuditOutcomeLabel(event);
  const resultTitle =
    outcome === 'error'
      ? [info?.grpc_status, info?.reason].filter(Boolean).join(': ') || 'Processing failed'
      : isCfnDisposition
        ? 'CE decision'
        : getAuditTypeLabel(event.audit_type);
  const sourceAgent = info?.source_agent_id || 'N/A';
  const destinationAgent = info?.destination_agent_id || 'N/A';
  const timestamp = formatAuditTimestamp(event.created_on, showTraceId);
  const traceId = showTraceId ? getAuditTraceId(event) : null;

  return (
    <Fragment>
      <tr className={cn('border-t border-[hsl(var(--border))]', flashing && 'audit-trace-flash')}>
        <td className="px-2 py-2.5">
          <time
            dateTime={event.created_on}
            title={`${formatAuditTimestamp(event.created_on)} UTC`}
            className="block whitespace-nowrap font-mono tabular-nums"
          >
            {timestamp}
          </time>
        </td>
        {showTraceId && (
          <td className="px-2 py-2.5">{traceId ? <InlineId value={traceId} alwaysShowCopyIcon copiedIconClassName="text-black" /> : 'N/A'}</td>
        )}
        <td className="px-2 py-2.5">
          {!ceName && ceId ? (
            <InlineId value={ceId} alwaysShowCopyIcon copiedIconClassName="text-black" className="w-full min-w-0" />
          ) : (
            <span className="block truncate whitespace-nowrap" title={ceName || 'N/A'}>
              {ceName || 'N/A'}
            </span>
          )}
        </td>
        <td className="px-2 py-2.5">
          <AuditOutcome outcome={outcome} label={outcomeLabel} title={resultTitle} />
        </td>
        <td className="px-2 py-2.5">
          <span className="block truncate whitespace-nowrap" title={sourceAgent}>
            {sourceAgent}
          </span>
        </td>
        <td className="px-2 py-2.5">
          <span className="block truncate whitespace-nowrap" title={destinationAgent}>
            {destinationAgent}
          </span>
        </td>
        <td className="px-1 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-6 w-6 p-0"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide audit JSON' : 'Show audit JSON'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={showTraceId ? 7 : 6} className="px-2 pb-3">
            <AuditEventJson event={event} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function parseAgentChanges(currentEvent: ParsedAuditEvent, previousEvent?: ParsedAuditEvent): AgentChange[] {
  const changes: AgentChange[] = [];

  const currentAgents = currentEvent.audit_information?.agents || [];
  const previousAgents = previousEvent?.audit_information?.agents || [];

  const currentAgentsMap = new Map(currentAgents.map((a: any) => [a.agent_id, a]));
  const previousAgentsMap = new Map(previousAgents.map((a: any) => [a.agent_id, a]));

  currentAgents.forEach((agent: any) => {
    if (!previousAgentsMap.has(agent.agent_id)) {
      changes.push({
        type: 'added',
        agentId: agent.agent_id
      });
    }
  });

  previousAgents.forEach((agent: any) => {
    if (!currentAgentsMap.has(agent.agent_id)) {
      changes.push({
        type: 'removed',
        agentId: agent.agent_id
      });
    }
  });

  // Find modified agents
  currentAgents.forEach((currentAgent: any) => {
    const previousAgent: any = previousAgentsMap.get(currentAgent.agent_id);
    if (previousAgent) {
      const agentChanges: string[] = [];

      if (JSON.stringify(currentAgent.config) !== JSON.stringify(previousAgent.config)) {
        agentChanges.push('Config updated');
      }

      if (agentChanges.length > 0) {
        changes.push({
          type: 'modified',
          agentId: currentAgent.agent_id,
          changes: agentChanges
        });
      }
    }
  });

  return changes;
}

function parseMASChanges(currentEvent: ParsedAuditEvent, previousEvent?: ParsedAuditEvent): string[] {
  const changes: string[] = [];

  if (!previousEvent) {
    return ['MAS created'];
  }

  const current = currentEvent.audit_information || {};
  const previous = previousEvent.audit_information || {};

  if (current.name !== previous.name) {
    changes.push(`Name changed from "${previous.name}" to "${current.name}"`);
  }

  if (current.description !== previous.description) {
    changes.push('Description updated');
  }

  if (JSON.stringify(current.config) !== JSON.stringify(previous.config)) {
    changes.push('Config updated');
  }

  return changes;
}

function getAuditTypeLabel(auditType: string): string {
  const labels: Record<string, string> = {
    RESOURCE_CREATED: 'Created',
    RESOURCE_UPDATED: 'Updated',
    RESOURCE_DELETED: 'Deleted',
    RESOURCE_PURGED: 'Purged',
    KNOWLEDGE_INGESTION: 'Knowledge Ingestion',
    KNOWLEDGE_QUERY: 'Knowledge Query',
    REASONING_QUERY: 'Reasoning Query',
    REASONING_FEEDBACK: 'Reasoning Feedback',
    MEMORY_OPERATION: 'Memory Operation',
    AGENT_MEMORY_OPERATION: 'Agent Memory Operation',
    PROXY_MEDIATED: 'Proxy Mediated',
    CE_INVOKED: 'CE Invoked',
    CE_NOT_INVOKED: 'CE Not Invoked'
  };
  return labels[auditType] || auditType.replace(/_/g, ' ');
}

function AuditTraceRows({
  traceId,
  events,
  hasMore,
  expanded,
  flashing,
  onToggle,
  children
}: {
  traceId: string;
  events: ParsedAuditEvent[];
  hasMore: boolean;
  expanded: boolean;
  flashing: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const summary = {allow: 0, deny: 0, modify: 0, error: 0, degraded: 0, unsupported: 0, unknown: 0, other: 0};
  for (const event of events) {
    summary[getAuditOutcome(event)]++;
  }

  return (
    <tbody aria-label={`Trace ${traceId}`}>
      <tr className={cn('border-y border-[hsl(var(--border))] bg-[hsl(var(--muted))]', flashing && 'audit-trace-flash')}>
        <td colSpan={5} className="px-2 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <InlineId label="Trace ID" value={traceId} alwaysShowCopyIcon copiedIconClassName="text-black" />
            <span
              className="text-xs text-muted-foreground"
              title={hasMore ? 'Count of loaded items; more may be available.' : 'Count of items in this view.'}
            >
              <span aria-hidden="true">Σ: {events.length}</span>
              <span className="sr-only">{events.length} audit items</span>
            </span>
            <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Summary of loaded audit items">
              {(Object.keys(summary) as AuditOutcomeType[])
                .filter((kind) => summary[kind] > 0)
                .map((kind) => (
                  <AuditOutcome key={kind} outcome={kind} count={summary[kind]} />
                ))}
            </div>
          </div>
        </td>
        <td className="px-1 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-6 w-6 p-0"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} trace ${traceId}`}
            title={expanded ? 'Collapse trace' : 'Expand trace'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </td>
      </tr>
      {expanded && children}
    </tbody>
  );
}

function AuditEventCard({
  event,
  expanded,
  onToggle,
  filterAgentId,
  resolvedResourceName
}: {
  event: ParsedAuditEvent;
  expanded: boolean;
  onToggle: () => void;
  filterAgentId?: string;
  resolvedResourceName?: string;
}) {
  const displayAgentChanges = filterAgentId ? event.agentChanges?.filter((change) => change.agentId === filterAgentId) : event.agentChanges;

  const hasDetails = event.audit_information || event.operation_id;
  const httpStatus = event.audit_information?.http_status;
  const createdBy = event.created_by === '00000000-0000-0000-0000-000000000000' ? 'Admin' : event.created_by;

  return (
    <div className="group p-4 bg-muted/30 rounded-lg border border-border hover:border-primary/50 transition-colors mb-3 last:mb-0">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {getAuditTypeLabel(event.audit_type)}
            </span>
            <Badge variant="info">{event.source || 'Unavailable'}</Badge>
            {httpStatus && (
              <Badge
                variant={httpStatus >= 200 && httpStatus < 300 ? 'default' : httpStatus >= 400 ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                HTTP {httpStatus}
              </Badge>
            )}
          </div>
          {hasDetails && (
            <Button variant="ghost" size="sm" onClick={onToggle} className="h-6 w-6 p-0">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </div>

        {(resolvedResourceName || event.operation_id) && (
          <InfoPanel>
            {resolvedResourceName && (
              <InfoRow label="Name">
                <span className="text-sm text-foreground">{resolvedResourceName}</span>
              </InfoRow>
            )}
            {event.operation_id && (
              <InfoRow label="Operation">
                <InlineId value={event.operation_id} />
              </InfoRow>
            )}
          </InfoPanel>
        )}

        {event.masChanges && event.masChanges.length > 0 && (
          <div className="space-y-1">
            {event.masChanges.map((change, idx) => (
              <div key={idx} className="text-sm text-foreground flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-primary mt-2"></div>
                <span>{change}</span>
              </div>
            ))}
          </div>
        )}

        {displayAgentChanges && displayAgentChanges.length > 0 && (
          <div className="space-y-2">
            {displayAgentChanges?.map((change, idx) => (
              <div key={idx} className="text-sm flex items-start gap-2 p-3 bg-background rounded-lg border border-border">
                {change.type === 'added' && (
                  <>
                    <Plus className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <span>
                      Agent <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{change.agentId}</code> added
                    </span>
                  </>
                )}
                {change.type === 'removed' && (
                  <>
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <span>
                      Agent <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{change.agentId}</code> removed
                    </span>
                  </>
                )}
                {change.type === 'modified' && (
                  <>
                    <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div>
                        Agent <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{change.agentId}</code>:
                      </div>
                      <ul className="ml-4 mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {change.changes?.map((c, i) => (
                          <li key={i}>• {c}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{createdBy}</span>
          </div>
          <time dateTime={event.created_on} className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground/70 font-normal tabular-nums">
            {formatAuditTimestamp(event.created_on)}
          </time>
        </div>

        {expanded && event.audit_information && (
          <div className="mt-3 space-y-3">
            {event.audit_information?.request && (
              <CollapsibleJsonField label="Request" value={JSON.stringify(event.audit_information.request, null, 2)} isEditMode={false} />
            )}
            {event.audit_information?.response && (
              <CollapsibleJsonField
                label="Response"
                isEditMode={false}
                value={(() => {
                  const response = event.audit_information.response;
                  if ('raw' in response && response.raw !== undefined) {
                    if (typeof response.raw === 'string') {
                      try {
                        return JSON.stringify(JSON.parse(response.raw), null, 2);
                      } catch {
                        return response.raw;
                      }
                    }
                    return JSON.stringify(response.raw, null, 2);
                  }
                  return JSON.stringify(response, null, 2);
                })()}
              />
            )}
            {!event.audit_information?.request && !event.audit_information?.response && (
              <CollapsibleJsonField label="Audit Information" value={JSON.stringify(event.audit_information, null, 2)} isEditMode={false} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MASAuditLog({masId, workspaceId: _workspaceId, masName, agents}: MASAuditLogProps) {
  const groupingSwitchId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [groupByTrace, setGroupByTrace] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [collapsedTraces, setCollapsedTraces] = useState<Set<string>>(new Set());
  const [activityDeadlines, setActivityDeadlines] = useState<Map<string, number>>(new Map());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedAuditType, setSelectedAuditType] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<AuditOutcomeFilter | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'success' | 'failed' | null>(null);
  const {auditRefreshIntervalMs, auditFlashDurationMs} = getApiConfig();
  const activityEnabled = auditRefreshIntervalMs > 0 && auditFlashDurationMs > 0;

  const availableAuditTypes = auditTypeOptions;

  useEffect(() => {
    if (isOpen) {
      setSelectedAgent(null);
      setSelectedAuditType(null);
      setSelectedOutcome(null);
      setSelectedStatus(null);
      setExpandedEvents(new Set());
      setCollapsedTraces(new Set());
    }
  }, [isOpen]);

  const auditTypeFilter = selectedAuditType ? {audit_type: selectedAuditType} : {};

  const apiFilters = {
    ...auditTypeFilter,
    ...(selectedOutcome ? {outcome: selectedOutcome} : {}),
    ...(selectedStatus ? {success: selectedStatus === 'success'} : {})
  };

  const handleIncomingAuditEvents = useCallback(
    (events: AuditEvent[]) => {
      if (!isOpen || !activityEnabled) {
        return;
      }
      const agentIds = new Set(agents?.map((agent) => agent.agent_id) ?? []);
      const changedItems = new Set<string>();
      for (const event of events) {
        if (!auditEventMatchesMas(event, masId, agentIds, selectedAgent)) {
          continue;
        }
        changedItems.add(`event:${event.id}`);
        const traceId = getAuditTraceId(event);
        if (traceId) {
          changedItems.add(`trace:${traceId}`);
        }
      }
      if (changedItems.size > 0) {
        const expiresAt = Date.now() + auditFlashDurationMs;
        setActivityDeadlines((previous) => {
          const next = new Map(previous);
          for (const key of changedItems) {
            next.set(key, expiresAt);
          }
          return next;
        });
      }
    },
    [isOpen, activityEnabled, agents, masId, selectedAgent, auditFlashDurationMs]
  );

  const {auditEvents, hasLoaded, isLoading, isLoadingMore, isValidating, error, hasMore, loadMore, reset, retry} = useAuditEvents(
    isOpen ? apiFilters : undefined,
    {
      onIncomingEvents: activityEnabled ? handleIncomingAuditEvents : undefined
    }
  );

  useEffect(() => {
    setActivityDeadlines((previous) => (previous.size === 0 ? previous : new Map()));
  }, [isOpen, masId, selectedAgent, selectedAuditType, selectedOutcome, selectedStatus, activityEnabled]);

  useEffect(() => {
    if (activityDeadlines.size === 0) {
      return;
    }
    const nextExpiry = Math.min(...activityDeadlines.values());
    const timer = setTimeout(
      () => {
        const now = Date.now();
        setActivityDeadlines((previous) => new Map([...previous].filter(([, expiresAt]) => expiresAt > now)));
      },
      Math.max(0, nextExpiry - Date.now())
    );
    return () => clearTimeout(timer);
  }, [activityDeadlines]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void reset();
    void retry();
  }, [isOpen, selectedAgent, selectedAuditType, selectedOutcome, selectedStatus, reset, retry]);

  const availableAgents = useMemo(() => agents?.map((a) => a.agent_id) ?? [], [agents]);

  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    agents?.forEach((a) => {
      if (a.name) {
        map[a.agent_id] = a.name;
      }
    });
    return map;
  }, [agents]);

  const parsedEvents = useMemo<ParsedAuditEvent[]>(() => {
    const agentIds = new Set(agents?.map((a) => a.agent_id) || []);

    const combined = auditEvents.filter((event) => auditEventMatchesMas(event, masId, agentIds, selectedAgent));

    const sorted = [...combined].sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime());

    const parsedSorted: ParsedAuditEvent[] = sorted.map((event) => ({
      ...event,
      audit_information: event.audit_information as AuditInformation | null | undefined
    }));

    return parsedSorted.map((event, index) => {
      const previousEvent = parsedSorted[index + 1];
      return {
        ...event,
        agentChanges:
          event.audit_type === 'RESOURCE_UPDATED' || event.audit_type === 'RESOURCE_CREATED' ? parseAgentChanges(event, previousEvent) : undefined,
        masChanges:
          event.audit_type === 'RESOURCE_UPDATED' || event.audit_type === 'RESOURCE_CREATED' ? parseMASChanges(event, previousEvent) : undefined
      };
    });
  }, [auditEvents, masId, agents, selectedAgent]);

  const traceGroups = useMemo<AuditTraceGroup[]>(() => {
    const groups = new Map<string, AuditTraceGroup>();
    // parsedEvents is already newest first, so insertion order preserves that
    // order for traces and for the rows inside each trace.
    for (const event of parsedEvents) {
      const traceId = getAuditTraceId(event);
      // Missing or truncated trace IDs must not combine unrelated requests.
      const key = traceId ? `trace:${traceId}` : `event:${event.id}`;
      let group = groups.get(key);
      if (!group) {
        group = {key, traceId, events: []};
        groups.set(key, group);
      }
      group.events.push(event);
    }
    return Array.from(groups.values());
  }, [parsedEvents]);

  const expandableTraceGroups = traceGroups.filter((group) => group.traceId !== null);
  const allTracesExpanded = expandableTraceGroups.length > 0 && expandableTraceGroups.every((group) => !collapsedTraces.has(group.key));
  const showLoadMore = hasMore;

  const toggleExpanded = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const toggleTraceExpanded = (groupKey: string) => {
    setCollapsedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleAllTracesExpanded = () => {
    setCollapsedTraces((previous) => {
      const next = new Set(previous);
      const expandAll = expandableTraceGroups.some((group) => previous.has(group.key));
      for (const group of expandableTraceGroups) {
        if (expandAll) {
          next.delete(group.key);
        } else {
          next.add(group.key);
        }
      }
      return next;
    });
  };

  const renderAuditEvent = (event: ParsedAuditEvent) => (
    <AuditEventCard
      key={event.id}
      event={event}
      expanded={expandedEvents.has(event.id)}
      onToggle={() => toggleExpanded(event.id)}
      resolvedResourceName={
        event.resource_type === 'MAS'
          ? masName
          : event.resource_type === 'MAS-AGENT'
            ? agentNameMap[event.resource_identifier] || event.resource_identifier
            : undefined
      }
    />
  );

  const renderAuditRow = (event: ParsedAuditEvent) => (
    <AuditEventRow
      key={event.id}
      event={event}
      expanded={expandedEvents.has(event.id)}
      onToggle={() => toggleExpanded(event.id)}
      showTraceId={!groupByTrace}
      flashing={!groupByTrace && activityDeadlines.has(`event:${event.id}`)}
    />
  );

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setGroupByTrace(false);
    }
    setIsOpen(open);
  };

  return (
    <>
      <ActionButton icon={History} label="Audit" onClick={() => handleOpenChange(true)} />

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            'max-w-3xl h-screen max-h-screen overflow-hidden p-0 gap-0 flex flex-col bg-card',
            'fixed right-0 top-0 bottom-0 translate-x-0 translate-y-0 left-auto rounded-none',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right'
          )}
        >
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <DialogTitle className="text-xl">Audit Trail</DialogTitle>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <DialogDescription className="min-w-0 text-left">View audit logs and actions for {masName}</DialogDescription>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <label htmlFor={groupingSwitchId} className="cursor-pointer text-xs text-[hsl(var(--foreground))]">
                  Group by Trace ID
                </label>
                <Switch id={groupingSwitchId} checked={groupByTrace} onCheckedChange={setGroupByTrace} />
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 py-4 flex flex-wrap items-center gap-3 border-b flex-shrink-0">
            <Select
              value={selectedAgent || 'ALL'}
              onValueChange={(value) => {
                setSelectedAgent(value === 'ALL' ? null : value);
                setSelectedAuditType(null);
              }}
            >
              <SelectTrigger className="w-[150px]" aria-label="Filter by agent">
                <SelectValue>{selectedAgent ? agentNameMap[selectedAgent] || selectedAgent : 'Agents'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {availableAgents.map((agentId) => (
                  <SelectItem key={agentId} value={agentId}>
                    {agentNameMap[agentId] || agentId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedAuditType || 'ALL'} onValueChange={(value) => setSelectedAuditType(value === 'ALL' ? null : value)}>
              <SelectTrigger className="w-[170px]" aria-label="Filter by event type">
                <SelectValue>{selectedAuditType ? getAuditTypeLabel(selectedAuditType) : 'Events'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {availableAuditTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedOutcome || 'ALL'}
              onValueChange={(value) => setSelectedOutcome(value === 'ALL' ? null : (value as AuditOutcomeFilter))}
            >
              <SelectTrigger className="w-[170px]" aria-label="Filter by outcome">
                <SelectValue>{selectedOutcome ? outcomeLabels[selectedOutcome] : 'Outcome: All'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All outcomes</SelectItem>
                {(Object.keys(outcomeLabels) as AuditOutcomeFilter[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {outcomeLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedStatus || 'ALL'}
              onValueChange={(value) => setSelectedStatus(value === 'ALL' ? null : (value as 'success' | 'failed'))}
            >
              <SelectTrigger className="w-[150px]" aria-label="Filter by status">
                <SelectValue>{selectedStatus === 'success' ? 'Success' : selectedStatus === 'failed' ? 'Failed' : 'Status: All'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            {(selectedAgent || selectedAuditType || selectedOutcome || selectedStatus) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-10 w-6 shrink-0 p-0"
                aria-label="Clear filters"
                title="Clear filters"
                onClick={() => {
                  setSelectedAgent(null);
                  setSelectedAuditType(null);
                  setSelectedOutcome(null);
                  setSelectedStatus(null);
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {hasLoaded && error && (
              <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-2 text-xs text-[hsl(var(--muted-foreground))]" role="status">
                <span>
                  Could not update audit events. Showing previously loaded data.
                  {auditRefreshIntervalMs > 0 && ' Retrying automatically.'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={retry}
                  disabled={isValidating}
                  aria-label="Retry loading audit events"
                >
                  Retry
                </Button>
              </div>
            )}
            <div className="flex-1 overflow-auto px-6 pb-4 min-h-0">
              <ConditionalSWRRenderer
                data={parsedEvents}
                error={hasLoaded ? undefined : error}
                itemName="audit events"
                customIsLoading={isLoading}
                emptyListStateProps={{
                  title: 'No audit events found',
                  description: 'Try adjusting your filters or check back after activity occurs.'
                }}
              >
                <AuditEventTable
                  groupByTrace={groupByTrace}
                  hasTraceGroups={expandableTraceGroups.length > 0}
                  allTracesExpanded={allTracesExpanded}
                  onToggleAllTraces={toggleAllTracesExpanded}
                >
                  {groupByTrace ? (
                    traceGroups.map((group) =>
                      group.traceId ? (
                        <AuditTraceRows
                          key={group.key}
                          traceId={group.traceId}
                          events={group.events}
                          hasMore={hasMore}
                          expanded={!collapsedTraces.has(group.key)}
                          flashing={activityDeadlines.has(group.key)}
                          onToggle={() => toggleTraceExpanded(group.key)}
                        >
                          {group.events.map(renderAuditRow)}
                        </AuditTraceRows>
                      ) : (
                        <tbody key={group.key}>
                          {isCfnDispositionEvent(group.events[0]) || isProxyAuditEvent(group.events[0]) ? (
                            renderAuditRow(group.events[0])
                          ) : (
                            <tr>
                              <td colSpan={6} className="py-3">
                                {renderAuditEvent(group.events[0])}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      )
                    )
                  ) : (
                    <tbody>{parsedEvents.map(renderAuditRow)}</tbody>
                  )}
                </AuditEventTable>
              </ConditionalSWRRenderer>
              {showLoadMore && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={isValidating}>
                    {isLoadingMore ? 'Loading...' : 'Load more'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
