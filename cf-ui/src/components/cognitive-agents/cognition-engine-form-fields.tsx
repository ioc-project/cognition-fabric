// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {z} from 'zod';
import type {UseFormReturn} from 'react-hook-form';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {CopyableInput} from '@/components/ui/copyable-input';
import {ReadOnlyField} from '@/components/ui/read-only-field';
import {CollapsibleJsonField} from '@/components/mas/collapsible-json-field';
import {DATE_TIME_FORMAT_OPTIONS, validateJSON} from '@/lib/utils';
import type {CognitionEngineDetail} from '@/api/endpoints/cognition-engine';
import {dtCompactLabel} from '@/lib/detail-typography';

export const UpdateCEFormSchema = z.object({
  url: z.string().url('Must be a valid URL').or(z.literal('')),
  enabled: z.string(),
  mas_auto_associate: z.string(),
  capabilities: z.string().optional(),
  metrics: z.string().optional(),
  config: z
    .string()
    .optional()
    .refine((val) => !val || !val.trim() || validateJSON(val), {message: 'Must be valid JSON'})
});

export type FormValues = z.infer<typeof UpdateCEFormSchema>;

interface CognitionEngineFormFieldsProps {
  ce: CognitionEngineDetail | undefined;
  form: UseFormReturn<FormValues>;
  isEditMode: boolean;
  configExpanded: boolean;
  setConfigExpanded: (v: boolean) => void;
  onSubmit: (values: FormValues) => Promise<void>;
}

export function CognitionEngineFormFields({ce, form, isEditMode, configExpanded, setConfigExpanded, onSubmit}: CognitionEngineFormFieldsProps) {
  const configValue = ce?.config && Object.keys(ce.config).length > 0 ? JSON.stringify(ce.config, null, 2) : '';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>Name</Label>
            <ReadOnlyField value={ce?.name || ''} />
          </div>
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>ID</Label>
            <CopyableInput value={ce?.id || ''} />
          </div>
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>CFN ID</Label>
            <CopyableInput value={ce?.cfn_id || ''} />
          </div>
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>Version</Label>
            <ReadOnlyField value={ce?.version || ''} className="font-mono" />
          </div>
          <div className={`space-y-2 md:col-span-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>Kinds & Subkinds</Label>
            {ce?.kinds_subkinds && Object.keys(ce.kinds_subkinds).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ce.kinds_subkinds).flatMap(([kind, subkinds]) =>
                  subkinds.map((sk) => (
                    <span key={`${kind}:${sk}`} className="inline-flex items-center font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded text-foreground">
                      {kind}: {sk}
                    </span>
                  ))
                )}
              </div>
            ) : (
              <ReadOnlyField value="—" />
            )}
          </div>
          {ce?.subprotocols && ce.subprotocols.length > 0 && (
            <div className={`space-y-2 md:col-span-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
              <Label className={dtCompactLabel}>Subprotocols</Label>
              <div className="flex flex-wrap gap-1.5">
                {ce.subprotocols.map((sp) => (
                  <span key={sp} className="inline-flex items-center font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded text-foreground">
                    {sp}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ce?.category && ce.category !== 'UNKNOWN' && (
            <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
              <Label className={dtCompactLabel}>Category</Label>
              <ReadOnlyField value={ce.category} className="font-mono" />
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <Label className={dtCompactLabel}>URL</Label>
            {isEditMode ? (
              <FormField
                control={form.control}
                name="url"
                render={({field}) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} className="font-mono text-xs" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <ReadOnlyField value={ce?.url || ''} className="font-mono text-xs" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
          {isEditMode && (
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="enabled"
                render={({field}) => (
                  <FormItem>
                    <FormLabel>Enabled</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">Enabled</SelectItem>
                        <SelectItem value="false">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label className={dtCompactLabel}>MAS Auto Associate</Label>
            {isEditMode ? (
              <FormField
                control={form.control}
                name="mas_auto_associate"
                render={({field}) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">Enabled</SelectItem>
                        <SelectItem value="false">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <ReadOnlyField value={ce?.mas_auto_associate ? 'Enabled' : 'Disabled'} />
            )}
          </div>
          {ce?.last_seen && (
            <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
              <Label className={dtCompactLabel}>Last Seen</Label>
              <ReadOnlyField value={new Date(ce.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)} />
            </div>
          )}
        </div>

        <div className="space-y-6 border-t pt-6">
          <FormField
            control={form.control}
            name="config"
            render={({field}) => (
              <CollapsibleJsonField
                label="Config"
                value={isEditMode ? field.value || '' : configValue}
                isExpanded={configExpanded}
                onToggleExpand={() => setConfigExpanded(!configExpanded)}
                isEditMode={isEditMode}
                field={field}
                placeholder={'{\n  "key": "value"\n}'}
              />
            )}
          />
          <div className={`transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <CollapsibleJsonField
              label="Default MAS Config"
              value={ce?.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''}
              isEditMode={false}
            />
          </div>
        </div>

        {(isEditMode || (ce?.metrics && ce.metrics.length > 0) || (ce?.capabilities && ce.capabilities.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
            <div className="space-y-2">
              <Label className={dtCompactLabel}>Metrics</Label>
              {isEditMode ? (
                <FormField
                  control={form.control}
                  name="metrics"
                  render={({field}) => (
                    <FormItem>
                      <FormControl>
                        <Textarea {...field} placeholder="one metric per line" className="font-mono text-xs min-h-[100px] resize-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <pre className="font-mono text-[11px] text-muted-foreground bg-muted border border-border rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">
                  {ce?.metrics ? ce.metrics.join('\n') : '—'}
                </pre>
              )}
            </div>
            <div className="space-y-2">
              <Label className={dtCompactLabel}>Capabilities</Label>
              {isEditMode ? (
                <FormField
                  control={form.control}
                  name="capabilities"
                  render={({field}) => (
                    <FormItem>
                      <FormControl>
                        <Textarea {...field} placeholder="one capability per line" className="font-mono text-xs min-h-[100px] resize-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <pre className="font-mono text-[11px] text-muted-foreground bg-muted border border-border rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">
                  {ce?.capabilities ? ce.capabilities.join('\n') : '—'}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
          <div className="space-y-2">
            <Label className={dtCompactLabel}>Created At</Label>
            <Input value={ce?.created_at ? new Date(ce.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'} disabled readOnly />
          </div>
          {ce?.updated_at && (
            <div className="space-y-2">
              <Label className={dtCompactLabel}>Updated At</Label>
              <Input value={new Date(ce.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)} disabled readOnly />
            </div>
          )}
        </div>
      </form>
    </Form>
  );
}
