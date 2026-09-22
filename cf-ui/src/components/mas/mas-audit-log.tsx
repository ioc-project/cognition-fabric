// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useEffect, useMemo, useState} from 'react';
import {ChevronDown, ChevronRight, Edit, Plus, Trash2, User, History} from 'lucide-react';
import {useAuditEvents} from '@/hooks/useAuditEvents';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ActionButton} from '@/components/ui/action-button';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {InlineId} from '@/components/ui/inline-id';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {CollapsibleJsonField} from '@/components/mas/collapsible-json-field';
import type {AuditEvent, AuditInformation} from '@/api/endpoints/audit';
import {cn} from '@/lib/utils';

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
    AGENT_MEMORY_OPERATION: 'Agent Memory Operation'
  };
  return labels[auditType] || auditType.replace(/_/g, ' ');
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
          <div className="text-[11px] text-muted-foreground/70 font-normal">
            {new Date(event.created_on).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
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
  const [isOpen, setIsOpen] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedAuditType, setSelectedAuditType] = useState<string | null>(null);

  const ALL_AUDIT_TYPES = [
    {value: 'SHARED_MEMORY_OPERATION', label: 'Shared Memory Operation'},
    {value: 'AGENT_MEMORY_OPERATION', label: 'Agent Memory Operation'},
    {value: 'KNOWLEDGE_INGESTION', label: 'Knowledge Ingestion'}
  ];

  const availableAuditTypes = selectedAgent ? [{value: 'AGENT_MEMORY_OPERATION', label: 'Agent Memory Operation'}] : ALL_AUDIT_TYPES;

  useEffect(() => {
    if (isOpen) {
      setSelectedAgent(null);
      setSelectedAuditType(null);
      setExpandedEvents(new Set());
    }
  }, [isOpen]);

  const auditTypeFilter = selectedAuditType ? {audit_type: selectedAuditType} : {};

  const apiFilters = {
    ...(selectedAgent ? {resource_type: 'MAS-AGENT'} : {}),
    ...auditTypeFilter
  };

  const {auditEvents, isLoading, error, hasMore, loadMore, reset, mutate} = useAuditEvents(isOpen ? apiFilters : undefined);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    reset();
    void mutate();
  }, [isOpen, selectedAgent, selectedAuditType, reset, mutate]);

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

    const combined = auditEvents.filter((event) => {
      if (event.resource_type === 'MAS') {
        return event.audit_resource_identifier === masId || event.audit_information?.id === masId || event.resource_identifier === masId;
      }
      if (event.resource_type === 'MAS-AGENT') {
        if (selectedAgent) {
          return event.resource_identifier === selectedAgent;
        }
        if ((event.audit_information as AuditInformation | null)?.request?.http_request_body?.mas_id === masId) {
          return true;
        }
        return agentIds.has(event.resource_identifier);
      }
      return false;
    });

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

  const showLoadMore = hasMore && parsedEvents.length >= 10;

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

  return (
    <>
      <ActionButton icon={History} label="Audit" onClick={() => setIsOpen(true)} />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className={cn(
            'max-w-3xl h-screen max-h-screen overflow-hidden p-0 gap-0 flex flex-col bg-card',
            'fixed right-0 top-0 bottom-0 translate-x-0 translate-y-0 left-auto rounded-none',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right'
          )}
        >
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-xl">Audit Trail</DialogTitle>
                <DialogDescription className="mt-1">View audit logs and actions for {masName}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-6 py-4 flex items-center gap-3 border-b flex-shrink-0">
            <Select
              value={selectedAgent || 'ALL'}
              onValueChange={(value) => {
                setSelectedAgent(value === 'ALL' ? null : value);
                setSelectedAuditType(null);
              }}
            >
              <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[220px]">
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

            {(selectedAgent || selectedAuditType) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedAgent(null);
                  setSelectedAuditType(null);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <ConditionalSWRRenderer
              data={parsedEvents}
              error={error}
              itemName="audit events"
              customIsLoading={isLoading}
              emptyListStateProps={{
                title: 'No audit events found',
                description: 'Try adjusting your filters or check back after activity occurs.'
              }}
            >
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                {parsedEvents.map((event) => (
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
                ))}
                {showLoadMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
                      {isLoading ? 'Loading...' : 'Load more'}
                    </Button>
                  </div>
                )}
              </div>
            </ConditionalSWRRenderer>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
