'use client';

import {useMemo, useState} from 'react';
import {Clock} from 'lucide-react';
import {useAuditEventsPage} from '@/hooks/useAuditEvents';
import {useMAS} from '@/hooks/useMAS';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {ResourceTable} from '@/components/ui/resource-table';
import {Pagination} from '@/components/ui/pagination';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {AuditDetailPanel} from './audit-detail-panel';
import type {AuditEvent} from '@/api/endpoints/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOpaque(value: string): boolean {
  return UUID_RE.test(value) || /^\d+$/.test(value);
}

function ResourceIdentifier({value, resolvedName}: {value: string; resolvedName?: string}) {
  if (resolvedName) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <code className="text-xs font-mono cursor-help">{resolvedName}</code>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-mono text-xs">{value}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (!isOpaque(value)) {
    return <code className="text-xs font-mono">{value}</code>;
  }
  const truncated = UUID_RE.test(value) ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="text-xs font-mono text-muted-foreground cursor-help">{truncated}</code>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono text-xs">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const AUDIT_TYPES_BY_RESOURCE: Record<string, {value: string; label: string}[]> = {
  MAS: [
    {value: 'SHARED_MEMORY_OPERATION', label: 'Shared Memory Operation'},
    {value: 'KNOWLEDGE_INGESTION', label: 'Knowledge Ingestion'}
  ],
  'MAS-AGENT': [{value: 'AGENT_MEMORY_OPERATION', label: 'Agent Memory Operation'}],
  COGNITION_ENGINE: [
    {value: 'KNOWLEDGE_QUERY', label: 'Knowledge Query'},
    {value: 'SEMANTIC_NEGOTIATION', label: 'Semantic Negotiation'}
  ],
  MEMORY_PROVIDER: [{value: 'KNOWLEDGE_INGESTION', label: 'Knowledge Ingestion'}]
};

const ALL_AUDIT_TYPES = [
  {value: 'SHARED_MEMORY_OPERATION', label: 'Shared Memory Operation'},
  {value: 'KNOWLEDGE_INGESTION', label: 'Knowledge Ingestion'},
  {value: 'AGENT_MEMORY_OPERATION', label: 'Agent Memory Operation'},
  {value: 'KNOWLEDGE_QUERY', label: 'Knowledge Query'},
  {value: 'SEMANTIC_NEGOTIATION', label: 'Semantic Negotiation'}
];

function getAuditTypeLabel(auditType: string): string {
  const labels: Record<string, string> = {
    RESOURCE_CREATED: 'Created',
    RESOURCE_UPDATED: 'Updated',
    RESOURCE_DELETED: 'Deleted',
    RESOURCE_PURGED: 'Purged',
    KNOWLEDGE_INGESTION: 'Knowledge Ingestion',
    KNOWLEDGE_QUERY: 'Knowledge Query',
    SHARED_MEMORY_OPERATION: 'Shared Memory Operation',
    MEMORY_OPERATION: 'Memory Operation',
    AGENT_MEMORY_OPERATION: 'Agent Memory Operation',
    SEMANTIC_NEGOTIATION: 'Semantic Negotiation'
  };
  return labels[auditType] || auditType.replace(/_/g, ' ');
}

function getAuditTypeBadgeVariant(auditType: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    RESOURCE_CREATED: 'default',
    RESOURCE_UPDATED: 'secondary',
    RESOURCE_DELETED: 'destructive',
    RESOURCE_PURGED: 'destructive',
    KNOWLEDGE_INGESTION: 'default',
    KNOWLEDGE_QUERY: 'secondary',
    SHARED_MEMORY_OPERATION: 'secondary',
    MEMORY_OPERATION: 'secondary',
    AGENT_MEMORY_OPERATION: 'secondary',
    SEMANTIC_NEGOTIATION: 'secondary'
  };
  return variants[auditType] || 'outline';
}

function getResourceTypeLabel(resourceType: string): string {
  const labels: Record<string, string> = {
    MAS: 'Multi-Agentic System',
    'MAS-AGENT': 'MAS Agent',
    COGNITION_ENGINE: 'Cognition Engine',
    MEMORY_PROVIDER: 'Memory Provider'
  };
  return labels[resourceType] || resourceType;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function AuditTable() {
  const [selectedResourceType, setSelectedResourceType] = useState<string | null>(null);
  const [selectedAuditType, setSelectedAuditType] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [page, setPage] = useState(0);

  const {defaultWorkspaceId} = useDefaultWorkspace();
  const {masList} = useMAS(defaultWorkspaceId ?? '');
  const masNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const mas of masList) {
      map[mas.id] = mas.name;
    }
    return map;
  }, [masList]);

  const availableAuditTypes = selectedResourceType ? (AUDIT_TYPES_BY_RESOURCE[selectedResourceType] ?? ALL_AUDIT_TYPES) : ALL_AUDIT_TYPES;

  const handleResourceTypeChange = (value: string | null) => {
    setSelectedResourceType(value);
    setPage(0);
    if (value && selectedAuditType) {
      const supported = AUDIT_TYPES_BY_RESOURCE[value]?.map((t) => t.value) ?? [];
      if (!supported.includes(selectedAuditType)) {
        setSelectedAuditType(null);
      }
    }
  };

  const filters = {
    ...(selectedResourceType ? {resource_type: selectedResourceType} : {}),
    ...(selectedAuditType ? {audit_type: selectedAuditType} : {})
  };

  const {auditEvents, totalElements, totalPages, isLoading, error} = useAuditEventsPage(filters, page, 20);

  const hasActiveFilters = !!(selectedResourceType || selectedAuditType);

  const headers = [
    {content: 'Resource Name', className: 'w-48'},
    {content: 'Resource Type', className: 'w-52'},
    {content: 'Event Type', className: 'w-56'},
    {content: 'Created At', className: 'w-44'}
  ];

  return (
    <div className="flex flex-col gap-8 flex-1 min-h-0">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedResourceType || 'ALL'} onValueChange={(v) => handleResourceTypeChange(v === 'ALL' ? null : v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>{selectedResourceType ? getResourceTypeLabel(selectedResourceType) : 'All resources'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="MAS">Multi-Agentic System</SelectItem>
            <SelectItem value="MAS-AGENT">MAS Agent</SelectItem>
            <SelectItem value="COGNITION_ENGINE">Cognition Engine</SelectItem>
            <SelectItem value="MEMORY_PROVIDER">Memory Provider</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedAuditType || 'ALL'}
          onValueChange={(v) => {
            setSelectedAuditType(v === 'ALL' ? null : v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue>{selectedAuditType ? getAuditTypeLabel(selectedAuditType) : 'All events'}</SelectValue>
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

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedResourceType(null);
              setSelectedAuditType(null);
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 rounded-md border border-border bg-card flex flex-col overflow-hidden">
        <ConditionalSWRRenderer
          data={auditEvents}
          error={error}
          itemName="audit events"
          customIsLoading={isLoading && auditEvents.length === 0}
          emptyListStateProps={{
            title: 'No audit events found',
            description: hasActiveFilters ? 'Try adjusting your filters.' : 'No audit events have been recorded yet.'
          }}
          classNameContainer="flex-1 justify-center"
        >
          <div className="overflow-auto h-full">
            <ResourceTable
              items={auditEvents}
              headers={headers}
              rowKey={(event) => String(event.id)}
              isSelected={(event) => selectedEvent !== null && event.id === selectedEvent.id}
              onRowClick={(event) => setSelectedEvent(event)}
              renderRow={(event) => [
                {
                  content: (
                    <ResourceIdentifier
                      value={event.resource_identifier}
                      resolvedName={
                        event.resource_type === 'MAS' || event.resource_type === 'MEMORY_PROVIDER' ? masNameMap[event.resource_identifier] : undefined
                      }
                    />
                  )
                },
                {
                  content: (
                    <Badge variant="outline" className="text-xs font-normal">
                      {getResourceTypeLabel(event.resource_type)}
                    </Badge>
                  )
                },
                {
                  content: (
                    <Badge variant={getAuditTypeBadgeVariant(event.audit_type)} className="text-xs">
                      {getAuditTypeLabel(event.audit_type)}
                    </Badge>
                  )
                },
                {
                  content: (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 shrink-0" />
                      {formatDateTime(event.created_on)}
                    </div>
                  )
                }
              ]}
            />
          </div>
        </ConditionalSWRRenderer>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs text-muted-foreground">{totalElements} total</span>
          <Pagination currentPage={page + 1} totalPages={totalPages} onPageChange={(p) => setPage(p - 1)} />
        </div>
      )}

      <AuditDetailPanel
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        resolvedResourceName={
          selectedEvent && (selectedEvent.resource_type === 'MAS' || selectedEvent.resource_type === 'MEMORY_PROVIDER')
            ? masNameMap[selectedEvent.resource_identifier]
            : undefined
        }
      />
    </div>
  );
}
