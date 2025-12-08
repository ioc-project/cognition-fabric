'use client';
import React, {useState} from 'react';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/components/ui/select';
import {MultiSelect} from '@/components/ui/multi-select';
import {Button} from '@/components/ui/button';
import type {Template, AttributeValue, KeyValue} from '@/types/template-config';

function getAttributeDisplayValue(value?: AttributeValue): string {
  if (!value) return '';
  return String(value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue ?? '');
}

export function TemplateView({template}: {template: Template}) {
  const extraction = template?.config?.extraction;
  const resourceSpans = template?.config?.resourceSpans || [];
  const [viewMode, setViewMode] = useState<'card' | 'json'>('card');

  return (
    <Card variant="list" className="flex flex-col max-h-[calc(100vh-150px)] mx-16">
      <div className="flex-shrink-0 flex justify-end p-6 pb-0">
        <Button variant="sidebar" size="sm" onClick={() => setViewMode(viewMode === 'card' ? 'json' : 'card')}>
          {viewMode === 'card' ? 'View JSON' : 'View Card'}
        </Button>
      </div>
      <CardContent className="overflow-y-auto flex-1">
        {viewMode === 'json' ? (
          <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs font-mono">{JSON.stringify(template, null, 2)}</pre>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <Label>Type</Label>
                <Input value={String(template.type ?? '')} disabled readOnly />
              </div>
              <div className="space-y-2">
                <Label>ID</Label>
                <Input value={template.id} disabled readOnly />
              </div>
            </div>

            {extraction && (
              <section className="space-y-4 mb-6">
                <h2 className="form-section-header">Extraction Config</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Use CRF</Label>
                    <Select value={extraction.use_crf ? 'true' : 'false'} onValueChange={() => {}}>
                      <SelectTrigger aria-readonly="true">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="text-popover-foreground" align="start">
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Confidence Threshold</Label>
                    <Input value={String(extraction.confidence_threshold ?? '')} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Entities</Label>
                    <MultiSelect value={extraction.entities || []} options={extraction.entities || []} onChange={() => {}} align="start" />
                  </div>
                  <div className="space-y-2">
                    <Label>Lowercase</Label>
                    <Select value={extraction.preprocessing?.lowercase ? 'true' : 'false'} onValueChange={() => {}}>
                      <SelectTrigger aria-readonly="true">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="text-popover-foreground" align="start">
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tokenizer</Label>
                    <Input value={String(extraction.preprocessing?.tokenizer ?? '')} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Remove Punctuation</Label>
                    <Select value={extraction.preprocessing?.remove_punctuation ? 'true' : 'false'} onValueChange={() => {}}>
                      <SelectTrigger aria-readonly="true">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="text-popover-foreground" align="start">
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            )}

            {resourceSpans?.length > 0 && (
              <section className="space-y-4">
                <h2 className="form-section-header">Config</h2>
                <div className="rounded-lg border p-4">
                  {resourceSpans.map((rs, idx) => (
                    <div key={idx} className="space-y-6">
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(rs.resource?.attributes || []).map((attr: KeyValue, aIdx: number) => (
                            <div key={aIdx} className="space-y-2">
                              <Label>{attr.key}</Label>
                              <Input value={getAttributeDisplayValue(attr.value)} disabled readOnly />
                            </div>
                          ))}
                        </div>
                      </div>

                      {(rs.scopeSpans || []).map((scopeSpan, ssIdx: number) => (
                        <div key={ssIdx} className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Name</Label>
                              <Input value={scopeSpan.scope?.name ?? ''} disabled readOnly />
                            </div>
                            <div className="space-y-2">
                              <Label>Version</Label>
                              <Input value={scopeSpan.scope?.version ?? ''} disabled readOnly />
                            </div>
                          </div>

                          {(scopeSpan.spans || []).length > 0 && (
                            <div className="space-y-3">
                              {(scopeSpan.spans || []).map((span, spIdx: number) => (
                                <div key={spIdx} className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                      <Label>Name</Label>
                                      <Input value={span.name ?? ''} disabled readOnly />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Kind</Label>
                                      <Input value={span.kind ?? ''} disabled readOnly />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Status Code</Label>
                                      <Input value={span.status?.code ?? ''} disabled readOnly />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                      <Label>Trace ID</Label>
                                      <Input value={span.traceId ?? ''} disabled readOnly className="font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Span ID</Label>
                                      <Input value={span.spanId ?? ''} disabled readOnly className="font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Parent Span ID</Label>
                                      <Input value={span.parentSpanId ?? ''} disabled readOnly className="font-mono text-xs" />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                      <Label>Start Time (Unix Nano)</Label>
                                      <Input value={span.startTimeUnixNano ?? ''} disabled readOnly className="font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>End Time (Unix Nano)</Label>
                                      <Input value={span.endTimeUnixNano ?? ''} disabled readOnly className="font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Duration (ms)</Label>
                                      <Input
                                        value={String(computeDurationMs(String(span.startTimeUnixNano ?? ''), String(span.endTimeUnixNano ?? '')))}
                                        disabled
                                        readOnly
                                      />
                                    </div>
                                  </div>

                                  {Array.isArray(span.attributes) && span.attributes.length > 0 && (
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {span.attributes.map((attr: KeyValue, attrIdx: number) => (
                                          <div key={attrIdx} className="space-y-2">
                                            <Label>{attr.key}</Label>
                                            <Input value={getAttributeDisplayValue(attr.value)} disabled readOnly />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {Array.isArray(span.events) && span.events.length > 0 && (
                                    <div className="space-y-3">
                                      {span.events.map((event, evIdx: number) => (
                                        <div key={evIdx} className="space-y-3">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                              <Label>Event Name</Label>
                                              <Input value={event.name ?? ''} disabled readOnly />
                                            </div>
                                            <div className="space-y-2">
                                              <Label>Time (Unix Nano)</Label>
                                              <Input value={event.timeUnixNano ?? ''} disabled readOnly className="font-mono text-xs" />
                                            </div>
                                          </div>
                                          {Array.isArray(event.attributes) && event.attributes.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                              {event.attributes.map((attr: KeyValue, eaIdx: number) => (
                                                <div key={eaIdx} className="space-y-2">
                                                  <Label>{attr.key}</Label>
                                                  <Input value={getAttributeDisplayValue(attr.value)} disabled readOnly />
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function computeDurationMs(start?: string, end?: string) {
  if (!start || !end) {
    return '';
  }
  const ms = Number(end) / 1_000_000 - Number(start) / 1_000_000;
  return Math.max(0, Math.round(ms)).toString();
}
