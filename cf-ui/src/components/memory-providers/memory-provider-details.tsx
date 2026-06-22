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
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {toast} from 'sonner';
import {CopyableInput} from '@/components/ui/copyable-input';
import {ChevronDown, ChevronUp, Eye, EyeOff, KeyRound, Globe} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {StatCard} from '@/components/ui/stat-card';
import {dtLabel, dtValue, dtRow, dtSectionHeader, dtMetaLabel, dtMetaValue, dtPanelHeaderInteractive} from '@/lib/detail-typography';

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
  const [authExpanded, setAuthExpanded] = useState(true);
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
          if (values.username) {
            credentials.username = values.username;
          }
          if (values.password) {
            credentials.password = values.password;
          }
        } else if (values.authType === 'custom') {
          if (values.header_name) {
            credentials.header_name = values.header_name;
          }
          if (values.header_value) {
            credentials.header_value = values.header_value;
          }
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

  const fieldClass = dtRow;
  const labelClass = dtLabel;
  const valueClass = dtValue;
  const metadataLabelClass = dtMetaLabel;
  const metadataValueClass = dtMetaValue;

  const providerConfig = provider?.config as MemoryProviderConfig | null;
  const providerAuthType = providerConfig?.auth?.type ?? 'none';

  return (
    <>
      <BasePage
        title={provider?.name || 'Memory Provider Details'}
        description="View and manage memory provider details"
        customDescription={
          provider && (
            <div className="flex items-center gap-2">
              <Badge variant={provider.enabled ? 'info' : 'inactive'}>{provider.enabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
          )
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
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6" autoComplete="off">
              <div className="grid grid-cols-2 gap-8">
                <StatCard
                  icon={<Globe size={14} className="text-[hsl(var(--sidebar-icon-active))]" />}
                  label="Provider URL"
                  value={providerConfig?.url || '-'}
                />
                <StatCard
                  icon={<KeyRound size={14} className="text-[hsl(var(--sidebar-icon-active))]" />}
                  label="Auth Type"
                  value={authTypeLabel(providerAuthType)}
                />
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-card border border-border rounded-lg py-10 px-5">
                    <span className={labelClass}>Name</span>
                    {isEditMode ? (
                      <FormField
                        control={form.control}
                        name="name"
                        render={({field}) => (
                          <FormItem className="space-y-1 mt-2">
                            <FormControl>
                              <Input {...field} maxLength={100} autoComplete="off" className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <p className="text-2xl font-semibold text-foreground mt-2">{provider?.name || '-'}</p>
                    )}
                  </div>

                  <div className="bg-card border border-border rounded-lg py-10 px-5 min-w-0">
                    <span className={labelClass}>ID</span>
                    <div className="mt-2">
                      <CopyableInput value={provider?.id || ''} />
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg py-6 px-5">
                  <span className={labelClass}>Description</span>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="description"
                      render={({field}) => (
                        <FormItem className="space-y-1 mt-2">
                          <FormControl>
                            <Textarea {...field} rows={2} placeholder="Optional description" className="text-sm resize-none" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <p className="text-sm text-foreground mt-2">{provider?.description || '-'}</p>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-x-8 px-1 pt-1">
                  {provider?.created_at && (
                    <div className="flex flex-col gap-0.5">
                      <span className={metadataLabelClass}>Created</span>
                      <span className={metadataValueClass}>{new Date(provider.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
                    </div>
                  )}
                  {provider?.updated_at && (
                    <div className="flex flex-col gap-0.5">
                      <span className={metadataLabelClass}>Last Modified</span>
                      <span className={metadataValueClass}>{new Date(provider.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
                    </div>
                  )}
                  {provider?.created_by && (
                    <div className="flex flex-col gap-0.5">
                      <span className={metadataLabelClass}>Created By</span>
                      <span className={metadataValueClass}>{provider.created_by}</span>
                    </div>
                  )}
                  {provider?.updated_by && (
                    <div className="flex flex-col gap-0.5">
                      <span className={metadataLabelClass}>Last Modified By</span>
                      <span className={metadataValueClass}>{provider.updated_by}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-card border border-border rounded overflow-hidden">
                <div className={dtPanelHeaderInteractive} onClick={() => setAuthExpanded((v) => !v)}>
                  <span className={dtSectionHeader}>Config</span>
                  {authExpanded ? (
                    <ChevronUp size={13} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={13} className="text-muted-foreground" />
                  )}
                </div>

                {authExpanded && (
                  <div className="px-4">
                    <div className={fieldClass}>
                      <span className={labelClass}>Provider URL</span>
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="url"
                          render={({field}) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <Input {...field} placeholder="http://localhost:8765" autoComplete="off" className="h-8 text-sm font-mono" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <CopyableInput value={(provider?.config as MemoryProviderConfig | null)?.url || ''} />
                      )}
                    </div>

                    <div className={fieldClass}>
                      <span className={labelClass}>Auth Type</span>
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="authType"
                          render={({field}) => (
                            <FormItem className="space-y-1">
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
                        <span className={valueClass}>{authTypeLabel((provider?.config as MemoryProviderConfig | null)?.auth?.type ?? 'none')}</span>
                      )}
                    </div>

                    {!isEditMode &&
                      (() => {
                        const config = provider?.config as MemoryProviderConfig | null;
                        const creds = config?.auth?.credentials;
                        const type = config?.auth?.type;
                        if (!creds || !type || type === 'none') {
                          return null;
                        }

                        const RevealField = ({fieldKey, label, value}: {fieldKey: string; label: string; value: string}) => (
                          <div className={fieldClass}>
                            <span className={labelClass}>{label}</span>
                            <div className="flex items-center gap-2">
                              <span className={`${valueClass} font-mono truncate`}>{revealedFields.has(fieldKey) ? value : '••••••••••••'}</span>
                              <button
                                type="button"
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => toggleReveal(fieldKey)}
                              >
                                {revealedFields.has(fieldKey) ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </div>
                        );

                        if (type === 'token') {
                          return <RevealField fieldKey="api_key" label="API Key" value={creds.api_key ?? ''} />;
                        }
                        if (type === 'bearer') {
                          return <RevealField fieldKey="access_token" label="Access Token" value={creds.access_token ?? ''} />;
                        }
                        if (type === 'basic') {
                          return (
                            <>
                              <div className={fieldClass}>
                                <span className={labelClass}>Username</span>
                                <span className={valueClass}>{creds.username ?? '—'}</span>
                              </div>
                              <RevealField fieldKey="password" label="Password" value={creds.password ?? ''} />
                            </>
                          );
                        }
                        if (type === 'custom') {
                          return (
                            <>
                              <div className={fieldClass}>
                                <span className={labelClass}>Header Name</span>
                                <span className={valueClass}>{creds.header_name ?? '—'}</span>
                              </div>
                              <RevealField fieldKey="header_value" label="Header Value" value={creds.header_value ?? ''} />
                            </>
                          );
                        }
                        return null;
                      })()}

                    {isEditMode && authType === 'token' && (
                      <div className={fieldClass}>
                        <span className={labelClass}>API Key</span>
                        <FormField
                          control={form.control}
                          name="token"
                          render={({field}) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <Input type="password" placeholder="Enter API key" autoComplete="new-password" {...field} className="h-8 text-sm" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                    {isEditMode && authType === 'bearer' && (
                      <div className={fieldClass}>
                        <span className={labelClass}>Access Token</span>
                        <FormField
                          control={form.control}
                          name="access_token"
                          render={({field}) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="Enter access token"
                                  autoComplete="new-password"
                                  {...field}
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                    {isEditMode && authType === 'basic' && (
                      <>
                        <div className={fieldClass}>
                          <span className={labelClass}>Username</span>
                          <FormField
                            control={form.control}
                            name="username"
                            render={({field}) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input placeholder="Enter username" autoComplete="off" {...field} className="h-8 text-sm" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className={fieldClass}>
                          <span className={labelClass}>Password</span>
                          <FormField
                            control={form.control}
                            name="password"
                            render={({field}) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="Enter password"
                                    autoComplete="new-password"
                                    {...field}
                                    className="h-8 text-sm"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                    {isEditMode && authType === 'custom' && (
                      <>
                        <div className={fieldClass}>
                          <span className={labelClass}>Header Name</span>
                          <FormField
                            control={form.control}
                            name="header_name"
                            render={({field}) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input placeholder="X-API-Key" autoComplete="off" {...field} className="h-8 text-sm" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className={fieldClass}>
                          <span className={labelClass}>Header Value</span>
                          <FormField
                            control={form.control}
                            name="header_value"
                            render={({field}) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="Enter header value"
                                    autoComplete="new-password"
                                    {...field}
                                    className="h-8 text-sm"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                  </div>
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
