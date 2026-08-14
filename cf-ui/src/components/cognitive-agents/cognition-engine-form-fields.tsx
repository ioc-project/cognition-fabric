// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {z} from 'zod';
import type {UseFormReturn} from 'react-hook-form';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {CopyableInput} from '@/components/ui/copyable-input';
import {ReadOnlyField} from '@/components/ui/read-only-field';
import {CollapsibleJsonField} from '@/components/mas/collapsible-json-field';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import type {CognitionEngineDetail} from '@/api/endpoints/cognition-engine';
import {dtCompactLabel} from '@/lib/detail-typography';

export const UpdateCEFormSchema = z.object({
  base_url: z.string().url('Must be a valid URL').or(z.literal('')),
  endpoint: z.string().optional(),
  enabled: z.string(),
  mas_auto_associate: z.string()
});

export type FormValues = z.infer<typeof UpdateCEFormSchema>;

interface CognitionEngineFormFieldsProps {
  ce: CognitionEngineDetail | undefined;
  form: UseFormReturn<FormValues>;
  isEditMode: boolean;
  onSubmit: (values: FormValues) => Promise<void>;
}

export function CognitionEngineFormFields({ce, form, isEditMode, onSubmit}: CognitionEngineFormFieldsProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>Type</Label>
            <ReadOnlyField value={ce?.ce_type || ''} className="font-mono" />
          </div>
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>ID</Label>
            <CopyableInput value={ce?.id || ''} />
          </div>
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>CFN ID</Label>
            <CopyableInput value={ce?.cfn_id || ''} />
          </div>
          <div className="space-y-2">
            <Label className={dtCompactLabel}>Base URL</Label>
            {isEditMode ? (
              <FormField
                control={form.control}
                name="base_url"
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
              <ReadOnlyField value={ce?.base_url || ''} className="font-mono text-xs" />
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className={dtCompactLabel}>Endpoint</Label>
            {isEditMode ? (
              <FormField
                control={form.control}
                name="endpoint"
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
              <ReadOnlyField value={ce?.endpoint || ''} className="font-mono text-xs" />
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
          <div className={`transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <CollapsibleJsonField
              label="Default MAS Config"
              value={ce?.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''}
              isEditMode={false}
            />
          </div>
        </div>

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
