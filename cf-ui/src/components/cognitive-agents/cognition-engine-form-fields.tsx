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
import {formatTimestamp} from '@/lib/utils';
import type {CognitionEngineDetail} from '@/api/endpoints/cognition-engine';
import {dtCompactLabel} from '@/lib/detail-typography';

export type CEPurpose = 'enforcing' | 'health' | 'notification';

export interface CEPurposeConfig {
  key: CEPurpose;
  title: string;
  optional?: boolean;
  hasEndpoint: boolean;
  /** Protocols CFN supports for this purpose today. Add values here (and in the API schema) to extend. */
  protocols: readonly string[];
  urlPlaceholder: string;
  endpointPlaceholder: string;
  /** Field labels follow the protocol's own terms: gRPC has a target and a service, HTTP a URL and an endpoint. */
  urlLabel: string;
  endpointLabel: string;
}

export const CE_PURPOSES: readonly CEPurposeConfig[] = [
  {
    key: 'enforcing',
    title: 'Enforcing',
    optional: true,
    hasEndpoint: true,
    protocols: ['grpc'],
    urlPlaceholder: 'host:50051',
    endpointPlaceholder: 'ioc.ce.v1.CognitionEngine',
    urlLabel: 'Target',
    endpointLabel: 'Service'
  },
  {
    key: 'health',
    title: 'Health check',
    hasEndpoint: true,
    protocols: ['http'],
    urlPlaceholder: 'http://host:8080',
    endpointPlaceholder: '/healthz',
    urlLabel: 'URL',
    endpointLabel: 'Endpoint'
  },
  {
    key: 'notification',
    title: 'Notification',
    optional: true,
    hasEndpoint: true,
    protocols: ['http'],
    urlPlaceholder: 'http://host:8080',
    endpointPlaceholder: '/notifications',
    urlLabel: 'URL',
    endpointLabel: 'Endpoint'
  }
] as const;

const isHttpUrl = (value: string) => {
  try {
    const {protocol} = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const UpdateCEFormSchema = z
  .object({
    enforcing_url: z.string().trim(),
    enforcing_endpoint: z.string().trim(),
    enforcing_protocol: z.enum(['grpc']),
    health_url: z.string().trim().refine(isHttpUrl, 'Must be a valid http(s) URL'),
    health_endpoint: z.string().trim(),
    health_protocol: z.enum(['http']),
    notification_url: z
      .string()
      .trim()
      .refine((v) => v === '' || isHttpUrl(v), 'Must be a valid http(s) URL'),
    notification_endpoint: z.string().trim(),
    notification_protocol: z.enum(['http']),
    enabled: z.string(),
    mas_auto_associate: z.string()
  })
  .superRefine((values, ctx) => {
    // Enforcing is optional, but it is gRPC and a gRPC address has no service name, so url and endpoint go together.
    if (values.enforcing_url !== '' && values.enforcing_endpoint === '') {
      ctx.addIssue({code: 'custom', path: ['enforcing_endpoint'], message: 'Required when a target is set'});
    }
    if (values.enforcing_endpoint !== '' && values.enforcing_url === '') {
      ctx.addIssue({code: 'custom', path: ['enforcing_url'], message: 'Required when a service is set'});
    }

    if (values.health_endpoint === '') {
      ctx.addIssue({code: 'custom', path: ['health_endpoint'], message: 'Endpoint is required'});
    } else if (!values.health_endpoint.startsWith('/')) {
      ctx.addIssue({code: 'custom', path: ['health_endpoint'], message: "Must start with '/'"});
    }

    // CFN skips a CE unless it has both a notification URL and endpoint.
    const hasUrl = values.notification_url !== '';
    const hasEndpoint = values.notification_endpoint !== '';
    if (hasUrl && !hasEndpoint) {
      ctx.addIssue({code: 'custom', path: ['notification_endpoint'], message: 'Required when a notification URL is set'});
    }
    if (hasEndpoint && !hasUrl) {
      ctx.addIssue({code: 'custom', path: ['notification_url'], message: 'Required when a notification endpoint is set'});
    }
    // HTTP endpoints are paths that CFN appends to the URL.
    if (hasEndpoint && !values.notification_endpoint.startsWith('/')) {
      ctx.addIssue({code: 'custom', path: ['notification_endpoint'], message: "Must start with '/'"});
    }
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
            <Label className={dtCompactLabel}>Name</Label>
            <ReadOnlyField value={ce?.name || ''} className="font-mono" />
          </div>
          <div className={`space-y-2 transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
            <Label className={dtCompactLabel}>Version</Label>
            <ReadOnlyField value={ce?.version || ''} className="font-mono" />
          </div>
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
        </div>

        {CE_PURPOSES.map((purpose) => (
          <div key={purpose.key} className="space-y-4 border-t pt-6">
            <h3 className="text-sm font-medium">{purpose.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className={dtCompactLabel}>Protocol</Label>
                {isEditMode ? (
                  <FormField
                    control={form.control}
                    name={`${purpose.key}_protocol`}
                    render={({field}) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {purpose.protocols.map((protocol) => (
                              <SelectItem key={protocol} value={protocol}>
                                {protocol.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <ReadOnlyField value={(ce?.[`${purpose.key}_protocol`] || '').toUpperCase()} className="font-mono text-xs" />
                )}
              </div>
              <div className="space-y-2">
                <Label className={dtCompactLabel}>{purpose.urlLabel}</Label>
                {isEditMode ? (
                  <FormField
                    control={form.control}
                    name={`${purpose.key}_url`}
                    render={({field}) => (
                      <FormItem>
                        <FormControl>
                          <Input {...field} className="font-mono text-xs" placeholder={purpose.urlPlaceholder} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <ReadOnlyField value={ce?.[`${purpose.key}_url`] || ''} className="font-mono text-xs" />
                )}
              </div>
              {purpose.hasEndpoint && (
                <div className="space-y-2 md:col-span-2">
                  <Label className={dtCompactLabel}>{purpose.endpointLabel}</Label>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name={`${purpose.key}_endpoint`}
                      render={({field}) => (
                        <FormItem>
                          <FormControl>
                            <Input {...field} className="font-mono text-xs" placeholder={purpose.endpointPlaceholder} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <ReadOnlyField value={ce?.[`${purpose.key}_endpoint`] || ''} className="font-mono text-xs" />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

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
              <ReadOnlyField value={formatTimestamp(ce.last_seen)} />
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
            <Input value={ce?.created_at ? formatTimestamp(ce.created_at) : 'Unknown'} disabled readOnly />
          </div>
          {ce?.updated_at && (
            <div className="space-y-2">
              <Label className={dtCompactLabel}>Updated At</Label>
              <Input value={formatTimestamp(ce.updated_at)} disabled readOnly />
            </div>
          )}
        </div>
      </form>
    </Form>
  );
}
