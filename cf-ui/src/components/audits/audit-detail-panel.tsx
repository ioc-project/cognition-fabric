// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import type {AuditEvent, AuditInformation} from '@/api/endpoints/audit';
import {cn, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {CollapsibleJsonField} from '@/components/mas/collapsible-json-field';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import {IdHoverCard} from '@/components/ui/id-hover-card';

interface AuditDetailPanelProps {
  event: AuditEvent | null;
  onClose: () => void;
  resolvedResourceName?: string;
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  RESOURCE_CREATED: 'Created',
  RESOURCE_UPDATED: 'Updated',
  RESOURCE_DELETED: 'Deleted',
  RESOURCE_PURGED: 'Purged',
  SHARED_MEMORY_OPERATION: 'Shared Memory Operation',
  MEMORY_OPERATION: 'Memory Operation',
  AGENT_MEMORY_OPERATION: 'Agent Memory Operation',
  KNOWLEDGE_INGESTION: 'Knowledge Ingestion',
  KNOWLEDGE_QUERY: 'Knowledge Query',
  SEMANTIC_ALIGNMENT_DECIDE: 'Semantic Alignment Decide',
  SEMANTIC_ALIGNMENT_START: 'Semantic Alignment Start'
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  MAS: 'Multi-Agentic System',
  'MAS-AGENT': 'MAS Agent',
  MEMORY_PROVIDER: 'Memory Provider'
};

function AuditTypePill({auditType}: {auditType: string}) {
  const label = AUDIT_TYPE_LABELS[auditType] ?? auditType.replace(/_/g, ' ');
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-violet-500" />
      {label}
    </span>
  );
}

function ResourceTypePill({resourceType}: {resourceType: string}) {
  const label = RESOURCE_TYPE_LABELS[resourceType] ?? resourceType;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700">
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-sky-500" />
      {label}
    </span>
  );
}



function SectionLabel({children}: {children: React.ReactNode}) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-4 pb-1">{children}</p>
  );
}


export function AuditDetailPanel({event, onClose, resolvedResourceName}: AuditDetailPanelProps) {
  const isOpen = event !== null;
  const info = event?.audit_information as AuditInformation | null | undefined;
  const createdBy = event?.created_by === '00000000-0000-0000-0000-000000000000' ? 'Admin' : event?.created_by;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'max-w-2xl h-screen max-h-screen overflow-hidden p-0 gap-0 flex flex-col',
          'fixed right-0 top-0 bottom-0 translate-x-0 translate-y-0 left-auto rounded-none',
          'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right'
        )}
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-base font-semibold leading-tight">Audit Event Details</DialogTitle>
            {event && (
              <IdHoverCard
                value={String(event.id)}
                items={[
                  {label: 'Event ID', value: String(event.id)},
                  ...(event.operation_id ? [{label: 'Operation ID', value: event.operation_id}] : []),
                  {label: 'Resource ID', value: event.resource_identifier},
                  {label: 'Audit Resource ID', value: event.audit_resource_identifier}
                ]}
              />
            )}
          </div>
          <DialogDescription className="mt-0.5 text-xs">Full details for this audit event</DialogDescription>
        </DialogHeader>

        {event && (
          <>
            <div className="px-6 py-3 flex flex-wrap gap-2 border-b bg-muted/30 flex-shrink-0">
              <AuditTypePill auditType={event.audit_type} />
              <ResourceTypePill resourceType={event.resource_type} />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Resource */}
              <InfoPanel>
                <InfoRow label="Type">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-xs font-mono font-medium text-foreground">
                    {event.resource_type}
                  </span>
                </InfoRow>
                {resolvedResourceName && (
                  <InfoRow label="Name">
                    <span className="text-sm text-foreground">{resolvedResourceName}</span>
                  </InfoRow>
                )}
              </InfoPanel>

              {/* Audit Information */}
              {info && (
                <div className="space-y-3">
                  {info.request && (
                    <CollapsibleJsonField label="Request" value={JSON.stringify(info.request, null, 2)} isEditMode={false} />
                  )}
                  {info.response && (
                    <CollapsibleJsonField
                      label="Response"
                      isEditMode={false}
                      value={(() => {
                        const response = info.response as Record<string, unknown>;
                        if ('raw' in response && response.raw !== undefined) {
                          if (typeof response.raw === 'string') {
                            try { return JSON.stringify(JSON.parse(response.raw), null, 2); } catch { return response.raw; }
                          }
                          return JSON.stringify(response.raw, null, 2);
                        }
                        return JSON.stringify(response, null, 2);
                      })()}
                    />
                  )}
                  {!info.request && !info.response && (
                    <CollapsibleJsonField label="Audit Information" value={JSON.stringify(info, null, 2)} isEditMode={false} />
                  )}
                </div>
              )}

              {/* Metadata */}
              <InfoPanel>
                <InfoRow label="Created"><span className="text-sm font-mono text-foreground">{new Date(event.created_on).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span></InfoRow>
                <InfoRow label="Last Modified"><span className="text-sm font-mono text-foreground">{new Date(event.last_modified_on).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span></InfoRow>
                {createdBy && <InfoRow label="Created By"><span className="text-sm text-foreground">{String(createdBy)}</span></InfoRow>}
              </InfoPanel>

              {/* Extra Information */}
              {event.audit_extra_information && (
                <div>
                  <SectionLabel>Extra Information</SectionLabel>
                  <div className="p-3 bg-muted/30 rounded-lg border border-border text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                    {event.audit_extra_information}
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
