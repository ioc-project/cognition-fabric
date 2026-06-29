// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useEffect, useState, useCallback} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {swrKeys} from '@/lib/swr-config';
import {memoryProviderApi} from '@/api/endpoints';
import type {MemoryProvider, UpdateMemoryProviderRequest, MemoryProviderConfig, AuthType} from '@/api/types/memory-provider';
import {BasePage} from '@/components/ui/base-page';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {toast} from 'sonner';
import {Eye, EyeOff} from 'lucide-react';
import {InlineId} from '@/components/ui/inline-id';
import {StatusDot} from '@/components/ui/status-dot';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import {MetaCard} from '@/components/ui/meta-card';

const UpdateMemoryProviderFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  description: z.string().optional(),
  url: z.string().min(1, 'URL is required').url('Must be a valid URL'),
  authType: z.enum(['token', 'bearer', 'basic', 'custom', 'none']),
  token: z.string().optional(),
  access_token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  header_name: z.string().optional(),
  header_value: z.string().optional()
});

type FormValues = z.infer<typeof UpdateMemoryProviderFormSchema>;

function parseProviderConfig(config: MemoryProvider['config']): Omit<FormValues, 'name' | 'description'> {
  const typed = config as MemoryProviderConfig | null;
  const auth = typed?.auth;
  return {
    url: typed?.url ?? '',
    authType: (auth?.type as AuthType) ?? 'none',
    token: auth?.credentials?.api_key ?? '',
    access_token: auth?.credentials?.access_token ?? '',
    username: auth?.credentials?.username ?? '',
    password: auth?.credentials?.password ?? '',
    header_name: auth?.credentials?.header_name ?? '',
    header_value: auth?.credentials?.header_value ?? ''
  };
}


export default function MemoryProviderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawProviderId = params?.providerId as string | string[] | undefined;
  const providerId = Array.isArray(rawProviderId) ? rawProviderId[0] : rawProviderId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());
  const toggleReveal = useCallback((field: string) => {
    setRevealedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const {
    data: provider,
    error,
    isLoading,
    mutate
  } = useSWR<MemoryProvider>(providerId ? swrKeys.memoryProviderDetails(providerId) : null, () => memoryProviderApi.get(providerId as string));

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateMemoryProviderFormSchema),
    defaultValues: {
      name: '',
      description: '',
      url: '',
      authType: 'none',
      token: '',
      access_token: '',
      username: '',
      password: '',
      header_name: '',
      header_value: ''
    }
  });

  const authType = form.watch('authType');

  useEffect(() => {
    if (searchParams.get('edit') === 'true' && provider?.enabled && provider?.name !== 'ioc-memory-provider') {
      setIsEditMode(true);
    }
  }, [searchParams, provider?.enabled, provider?.name]);

  useEffect(() => {
    if (provider) {
      form.reset({
        name: provider.name,
        description: provider.description || '',
        ...parseProviderConfig(provider.config)
      });
    }
  }, [provider, form]);

  useEffect(() => {
    if (providerId === undefined) {
      router.replace('/not-found');
    }
  }, [providerId, router]);

  const crumbs = provider
    ? [
        {link: routes.memoryProviders.list, text: 'Memory Providers'},
        {link: '', text: provider.name || 'Provider', active: true}
      ]
    : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await memoryProviderApi.delete(data.id);
        toast.success(`Memory Provider "${data.name}" removed successfully`);
        await globalMutate(swrKeys.memoryProviders());
        router.push(routes.memoryProviders.list);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  const handleSave = async (values: FormValues) => {
    try {
      const auth: MemoryProviderConfig['auth'] = {type: values.authType};

      if (values.authType !== 'none') {
        const credentials: NonNullable<NonNullable<MemoryProviderConfig['auth']>['credentials']> = {};
        if (values.authType === 'token' && values.token) {
          credentials.api_key = values.token;
        } else if (values.authType === 'bearer' && values.access_token) {
          credentials.access_token = values.access_token;
        } else if (values.authType === 'basic') {
          if (values.username) credentials.username = values.username;
          if (values.password) credentials.password = values.password;
        } else if (values.authType === 'custom') {
          if (values.header_name) credentials.header_name = values.header_name;
          if (values.header_value) credentials.header_value = values.header_value;
        }
        auth.credentials = credentials;
      }

      const payload: UpdateMemoryProviderRequest = {
        name: values.name,
        description: values.description,
        config: {url: values.url, auth}
      };

      await memoryProviderApi.update(providerId as string, payload);
      toast.success('Memory Provider updated successfully');
      await mutate();
      setIsEditMode(false);
      router.replace(routes.memoryProviders.details(providerId as string));
    } catch (err) {
      const errorMessage = parseError(err);
      toast.error(errorMessage);
      throw err;
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    if (provider) {
      form.reset({
        name: provider.name,
        description: provider.description || '',
        ...parseProviderConfig(provider.config)
      });
    }
    router.replace(routes.memoryProviders.details(providerId as string));
  };

  const authTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      none: 'None',
      token: 'Token (API Key)',
      bearer: 'Bearer Token',
      basic: 'Basic Auth',
      custom: 'Custom Header'
    };
    return labels[type] ?? type;
  };

  const providerConfig = provider?.config as MemoryProviderConfig | null;
  const providerAuthType = providerConfig?.auth?.type ?? 'none';

  const RevealRow = ({fieldKey, label, value}: {fieldKey: string; label: string; value: string}) => (
    <InfoRow label={label}>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground font-mono">{revealedFields.has(fieldKey) ? value : '••••••••••••'}</span>
        <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" onClick={() => toggleReveal(fieldKey)}>
          {revealedFields.has(fieldKey) ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </InfoRow>
  );

  return (
    <>
      <BasePage
        title={provider?.name || 'Memory Provider Details'}
        customDescription={
          provider ? (
            <div className="flex items-center gap-3 flex-wrap">
              <StatusDot variant="state" active={provider.enabled} />
              <span className="text-muted-foreground/30 text-xs select-none">·</span>
              <InlineId label="ID" value={provider.id} />
            </div>
          ) : undefined
        }
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          provider && (
            <DetailsPageActions
              onDelete={() => deleteDialog.open({id: provider.id, name: provider.name})}
              onEdit={provider.name !== 'ioc-memory-provider' ? () => setIsEditMode(true) : undefined}
              isEditMode={isEditMode}
              onSave={form.handleSubmit(handleSave)}
              onCancelEdit={handleCancelEdit}
              isSaving={form.formState.isSubmitting}
            />
          )
        }
      >
        <ConditionalSWRRenderer
          data={provider}
          error={error}
          itemName="Memory Provider details"
          customIsLoading={isLoading}
          errorListStateProps={{title: 'Failed to load Memory Provider details'}}
          emptyListStateProps={{title: 'No Memory Provider details found'}}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4" autoComplete="off">

              <InfoPanel>
                <InfoRow label="Name">
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="name"
                      render={({field}) => (
                        <FormItem className="flex-1 space-y-1">
                          <FormControl>
                            <Input {...field} maxLength={100} autoComplete="off" className="h-8 text-sm" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <span className="text-sm text-foreground">{provider?.name || '—'}</span>
                  )}
                </InfoRow>

                <InfoRow label="Description">
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="description"
                      render={({field}) => (
                        <FormItem className="flex-1 space-y-1">
                          <FormControl>
                            <Input {...field} placeholder="Optional description" className="h-8 text-sm" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <span className="text-sm text-foreground">{provider?.description || '—'}</span>
                  )}
                </InfoRow>

                <InfoRow label="URL">
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="url"
                      render={({field}) => (
                        <FormItem className="flex-1 space-y-1">
                          <FormControl>
                            <Input {...field} placeholder="http://localhost:8765" autoComplete="off" className="h-8 text-sm font-mono" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <span className="text-sm text-foreground font-mono">{providerConfig?.url || '—'}</span>
                  )}
                </InfoRow>

                <InfoRow label="Auth Type">
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="authType"
                      render={({field}) => (
                        <FormItem className="flex-1 space-y-1">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="token">Token (API Key)</SelectItem>
                              <SelectItem value="bearer">Bearer Token</SelectItem>
                              <SelectItem value="basic">Basic Auth</SelectItem>
                              <SelectItem value="custom">Custom Header</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <span className="text-sm text-foreground">{authTypeLabel(providerAuthType)}</span>
                  )}
                </InfoRow>

                {!isEditMode &&
                  (() => {
                    const creds = providerConfig?.auth?.credentials;
                    const type = providerConfig?.auth?.type;
                    if (!creds || !type || type === 'none') return null;
                    if (type === 'token') return <RevealRow fieldKey="api_key" label="API Key" value={creds.api_key ?? ''} />;
                    if (type === 'bearer') return <RevealRow fieldKey="access_token" label="Access Token" value={creds.access_token ?? ''} />;
                    if (type === 'basic')
                      return (
                        <>
                          <InfoRow label="Username">
                            <span className="text-sm text-foreground">{creds.username ?? '—'}</span>
                          </InfoRow>
                          <RevealRow fieldKey="password" label="Password" value={creds.password ?? ''} />
                        </>
                      );
                    if (type === 'custom')
                      return (
                        <>
                          <InfoRow label="Header Name">
                            <span className="text-sm text-foreground">{creds.header_name ?? '—'}</span>
                          </InfoRow>
                          <RevealRow fieldKey="header_value" label="Header Value" value={creds.header_value ?? ''} />
                        </>
                      );
                    return null;
                  })()}

                {isEditMode && authType === 'token' && (
                  <InfoRow label="API Key">
                    <FormField
                      control={form.control}
                      name="token"
                      render={({field}) => (
                        <FormItem className="flex-1 space-y-1">
                          <FormControl>
                            <Input type="password" placeholder="Enter API key" autoComplete="new-password" {...field} className="h-8 text-sm" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </InfoRow>
                )}
                {isEditMode && authType === 'bearer' && (
                  <InfoRow label="Access Token">
                    <FormField
                      control={form.control}
                      name="access_token"
                      render={({field}) => (
                        <FormItem className="flex-1 space-y-1">
                          <FormControl>
                            <Input type="password" placeholder="Enter access token" autoComplete="new-password" {...field} className="h-8 text-sm" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </InfoRow>
                )}
                {isEditMode && authType === 'basic' && (
                  <>
                    <InfoRow label="Username">
                      <FormField
                        control={form.control}
                        name="username"
                        render={({field}) => (
                          <FormItem className="flex-1 space-y-1">
                            <FormControl>
                              <Input placeholder="Enter username" autoComplete="off" {...field} className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </InfoRow>
                    <InfoRow label="Password">
                      <FormField
                        control={form.control}
                        name="password"
                        render={({field}) => (
                          <FormItem className="flex-1 space-y-1">
                            <FormControl>
                              <Input type="password" placeholder="Enter password" autoComplete="new-password" {...field} className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </InfoRow>
                  </>
                )}
                {isEditMode && authType === 'custom' && (
                  <>
                    <InfoRow label="Header Name">
                      <FormField
                        control={form.control}
                        name="header_name"
                        render={({field}) => (
                          <FormItem className="flex-1 space-y-1">
                            <FormControl>
                              <Input placeholder="X-API-Key" autoComplete="off" {...field} className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </InfoRow>
                    <InfoRow label="Header Value">
                      <FormField
                        control={form.control}
                        name="header_value"
                        render={({field}) => (
                          <FormItem className="flex-1 space-y-1">
                            <FormControl>
                              <Input type="password" placeholder="Enter header value" autoComplete="new-password" {...field} className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </InfoRow>
                  </>
                )}
              </InfoPanel>

              <div className="grid grid-cols-2 gap-3">
                {provider?.created_at && (
                  <MetaCard label="Created" mono>{new Date(provider.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</MetaCard>
                )}
                {provider?.updated_at && (
                  <MetaCard label="Last Modified" mono>{new Date(provider.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</MetaCard>
                )}
                {provider?.created_by && (
                  <MetaCard label="Created By">{provider.created_by}</MetaCard>
                )}
                {provider?.updated_by && (
                  <MetaCard label="Last Modified By">{provider.updated_by}</MetaCard>
                )}
              </div>

            </form>
          </Form>
        </ConditionalSWRRenderer>
      </BasePage>
      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.close}
        onConfirm={handleDelete}
        title={`Remove ${deleteDialog.data?.name || 'Memory Provider'}`}
        description={deleteError ?? `Are you sure you want to remove "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Remove"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
