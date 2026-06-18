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

export const UpdateCEFormSchema = z.object({
  url: z.string().url('Must be a valid URL').or(z.literal('')),
  enabled: z.string(),
  mas_auto_associate: z.string(),
  capabilities: z.string().optional(),
  metrics: z.string().optional(),
  config: z
    .string()
    .optional()
    .refine((val) => !val || !val.trim() || validateJSON(val), {message: 'Must be valid JSON'}),
  mas_config: z
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
  masConfigExpanded: boolean;
  setMasConfigExpanded: (v: boolean) => void;
  onSubmit: (values: FormValues) => Promise<void>;
}

export function CognitionEngineFormFields({
  ce,
  form,
  isEditMode,
  configExpanded,
  setConfigExpanded,
  masConfigExpanded,
  setMasConfigExpanded,
  onSubmit
}: CognitionEngineFormFieldsProps) {
  const configValue = ce?.config && Object.keys(ce.config).length > 0 ? JSON.stringify(ce.config, null, 2) : '';
  const masConfigValue = ce?.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : '';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="detail-label">Name</Label>
            <ReadOnlyField value={ce?.name || ''} />
          </div>
          <div className="space-y-2">
            <Label className="detail-label">ID</Label>
            <CopyableInput value={ce?.id || ''} />
          </div>
          <div className="space-y-2">
            <Label className="detail-label">CFN ID</Label>
            <CopyableInput value={ce?.cfn_id || ''} />
          </div>
          <div className="space-y-2">
            <Label className="detail-label">Version</Label>
            <ReadOnlyField value={ce?.version || ''} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label className="detail-label">Kind</Label>
            <ReadOnlyField value={ce?.kind || '—'} />
          </div>
          <div className="space-y-2">
            <Label className="detail-label">Subkind</Label>
            <ReadOnlyField value={ce?.subkind || '—'} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="detail-label">URL</Label>
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
            <Label className="detail-label">MAS Auto Associate</Label>
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
            <div className="space-y-2">
              <Label className="detail-label">Last Seen</Label>
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
          <FormField
            control={form.control}
            name="mas_config"
            render={({field}) => (
              <CollapsibleJsonField
                label="MAS Config"
                value={isEditMode ? field.value || '' : masConfigValue}
                isExpanded={masConfigExpanded}
                onToggleExpand={() => setMasConfigExpanded(!masConfigExpanded)}
                isEditMode={isEditMode}
                field={field}
                placeholder={'{\n  "key": "value"\n}'}
              />
            )}
          />
        </div>

        {(isEditMode || (ce?.metrics && ce.metrics.length > 0) || (ce?.capabilities && ce.capabilities.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
            <div className="space-y-2">
              <Label className="detail-label">Metrics</Label>
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
                <pre className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">
                  {ce?.metrics ? ce.metrics.join('\n') : '—'}
                </pre>
              )}
            </div>
            <div className="space-y-2">
              <Label className="detail-label">Capabilities</Label>
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
                <pre className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">
                  {ce?.capabilities ? ce.capabilities.join('\n') : '—'}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
          <div className="space-y-2">
            <Label className="detail-label">Created At</Label>
            <Input value={ce?.created_at ? new Date(ce.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'} disabled readOnly />
          </div>
          {ce?.updated_at && (
            <div className="space-y-2">
              <Label className="detail-label">Updated At</Label>
              <Input value={new Date(ce.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)} disabled readOnly />
            </div>
          )}
        </div>
      </form>
    </Form>
  );
}
