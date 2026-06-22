'use client';

import {Clock, User, Copy, Check} from 'lucide-react';
import {useState} from 'react';
import {Badge} from '@/components/ui/badge';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import type {AuditEvent, AuditInformation} from '@/api/endpoints/audit';
import {cn} from '@/lib/utils';

interface AuditDetailPanelProps {
  event: AuditEvent | null;
  onClose: () => void;
  resolvedResourceName?: string;
}

function getAuditTypeLabel(auditType: string): string {
  const labels: Record<string, string> = {
    RESOURCE_CREATED: 'Created',
    RESOURCE_UPDATED: 'Updated',
    RESOURCE_DELETED: 'Deleted',
    RESOURCE_PURGED: 'Purged',
    KNOWLEDGE_INGESTION: 'Knowledge Ingestion',
    SHARED_MEMORY_OPERATION: 'Shared Memory Operation',
    MEMORY_OPERATION: 'Memory Operation',
    AGENT_MEMORY_OPERATION: 'Agent Memory Operation',
    SEMANTIC_ALIGNMENT_DECIDE: 'Semantic Alignment Decide',
    SEMANTIC_ALIGNMENT_START: 'Semantic Alignment Start'
  };
  return labels[auditType] || auditType.replace(/_/g, ' ');
}

function getAuditTypeBadgeVariant(auditType: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    RESOURCE_CREATED: 'default',
    RESOURCE_UPDATED: 'secondary',
    RESOURCE_DELETED: 'destructive',
    RESOURCE_PURGED: 'destructive',
    SHARED_MEMORY_OPERATION: 'secondary',
    MEMORY_OPERATION: 'secondary',
    AGENT_MEMORY_OPERATION: 'secondary',
    SEMANTIC_ALIGNMENT_DECIDE: 'secondary',
    SEMANTIC_ALIGNMENT_START: 'secondary'
  };
  return variants[auditType] || 'outline';
}

function getResourceTypeLabel(resourceType: string): string {
  const labels: Record<string, string> = {
    MAS: 'Multi-Agentic System',
    'MAS-AGENT': 'MAS Agent',
    MEMORY_PROVIDER: 'Memory Provider'
  };
  return labels[resourceType] || resourceType;
}

function CopyableCode({value, label}: {value: string; label?: string}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5 group">
        {label && <span className="text-muted-foreground font-medium text-xs">{label}:</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono cursor-help truncate max-w-[240px]">{value}</code>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-mono text-xs">{value}</p>
          </TooltipContent>
        </Tooltip>
        <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded" title="Copy">
          {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
    </TooltipProvider>
  );
}

function DetailRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
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
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <DialogTitle className="text-xl">Audit Event Details</DialogTitle>
              <DialogDescription className="mt-1">Full details for this audit event</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {event && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={getAuditTypeBadgeVariant(event.audit_type)}>{getAuditTypeLabel(event.audit_type)}</Badge>
              <Badge variant="outline">{getResourceTypeLabel(event.resource_type)}</Badge>
              {info?.status && (
                <Badge variant={info.status === 'SUCCESS' ? 'success' : info.status === 'FAILED' ? 'destructive' : 'inactive'}>{info.status}</Badge>
              )}
              {info?.http_status && (
                <Badge variant={info.http_status >= 200 && info.http_status < 300 ? 'default' : 'destructive'}>HTTP {info.http_status}</Badge>
              )}
            </div>

            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
              <DetailRow label="Event ID">
                <CopyableCode value={String(event.id)} />
              </DetailRow>

              {event.operation_id && (
                <DetailRow label="Operation ID">
                  <CopyableCode value={event.operation_id} />
                </DetailRow>
              )}

              <DetailRow label="Resource Type">
                <span className="font-mono text-xs">{event.resource_type}</span>
              </DetailRow>

              <DetailRow label="Resource Identifier">
                {resolvedResourceName ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{resolvedResourceName}</span>
                    <CopyableCode value={event.resource_identifier} />
                  </div>
                ) : (
                  <CopyableCode value={event.resource_identifier} />
                )}
              </DetailRow>

              <DetailRow label="Audit Resource ID">
                <CopyableCode value={event.audit_resource_identifier} />
              </DetailRow>

              <DetailRow label="Created">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  {new Date(event.created_on).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </div>
              </DetailRow>

              <DetailRow label="Created By">
                <div className="flex items-center gap-1.5 text-sm">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <CopyableCode value={String(createdBy)} />
                </div>
              </DetailRow>

              <DetailRow label="Last Modified">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  {new Date(event.last_modified_on).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </div>
              </DetailRow>
            </div>

            {info && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Audit Information</h3>

                {info.request && (
                  <div className="p-3 bg-background rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground font-semibold mb-2">Request</div>
                    <div className="space-y-2">
                      {info.request.http_method && info.request.http_url && (
                        <div className="flex items-start gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px] h-5 font-mono shrink-0">
                            {info.request.http_method}
                          </Badge>
                          <code className="text-[10px] break-all">{info.request.http_url}</code>
                        </div>
                      )}
                      {info.request.http_request_body && Object.keys(info.request.http_request_body).length > 0 && (
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">Body:</div>
                          <pre className="text-[10px] font-mono bg-muted p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                            {JSON.stringify(info.request.http_request_body, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {info.response && (
                  <div className="p-3 bg-background rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground font-semibold mb-2">Response</div>
                    <pre className="text-[10px] font-mono bg-muted p-2 rounded overflow-auto max-h-60 whitespace-pre-wrap break-words">
                      {(() => {
                        const response = info.response as Record<string, unknown>;
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
                    </pre>
                  </div>
                )}

                {!info.request && !info.response && (
                  <div className="p-3 bg-background rounded-lg border border-border">
                    <pre className="text-[10px] font-mono bg-muted p-2 rounded overflow-auto max-h-96 whitespace-pre-wrap">
                      {JSON.stringify(info, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {event.audit_extra_information && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Extra Information</h3>
                <div className="p-3 bg-muted/30 rounded-lg border border-border text-xs font-mono whitespace-pre-wrap break-words">
                  {event.audit_extra_information}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
