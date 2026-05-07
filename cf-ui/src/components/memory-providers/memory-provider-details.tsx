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
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {toast} from 'sonner';
import {CopyableInput} from '@/components/ui/copyable-input';
import {Eye, EyeOff} from 'lucide-react';
import {Button} from '@/components/ui/button';

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
      token: 'API Key',
      bearer: 'Bearer Token',
      basic: 'Basic Auth',
      custom: 'Custom Header'
    };
    return labels[type] ?? type;
  };

  return (
    <>
      <BasePage
        title={provider?.name || 'Memory Provider Details'}
        description="View and manage memory provider details"
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
          errorListStateProps={{
            title: 'Failed to load Memory Provider details'
          }}
          emptyListStateProps={{
            title: 'No Memory Provider details found'
          }}
        >
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6" autoComplete="off">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Provider ID — always read-only */}
                      <div className="space-y-2">
                        <Label>Provider ID</Label>
                        <CopyableInput value={provider?.id || ''} />
                      </div>

                      {/* Provider Name */}
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="name"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel>Provider Name</FormLabel>
                              <FormControl>
                                <Input {...field} maxLength={100} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2">
                          <Label>Provider Name</Label>
                          <Input value={provider?.name || ''} disabled readOnly />
                        </div>
                      )}

                      {/* Enabled — always read-only */}
                      <div className="space-y-2">
                        <Label>Enabled</Label>
                        <Input value={provider?.enabled ? 'Yes' : 'No'} disabled readOnly />
                      </div>

                      {/* Description */}
                      <div className="md:col-span-2">
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="description"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                  <Textarea {...field} rows={3} placeholder="Optional description" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea value={provider?.description || 'No description provided'} disabled readOnly rows={3} />
                          </div>
                        )}
                      </div>

                      {/* Provider URL */}
                      <div className="md:col-span-2">
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="url"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Provider URL</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="http://localhost:8765" autoComplete="off" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <div className="space-y-2">
                            <Label>Provider URL</Label>
                            <CopyableInput value={(provider?.config as MemoryProviderConfig | null)?.url || ''} />
                          </div>
                        )}
                      </div>

                      {/* Authentication Type */}
                      {isEditMode ? (
                        <div className="md:col-span-2">
                          <FormField
                            control={form.control}
                            name="authType"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Authentication Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select authentication type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="token">API Key</SelectItem>
                                    <SelectItem value="bearer">Bearer Token</SelectItem>
                                    <SelectItem value="basic">Basic Auth</SelectItem>
                                    <SelectItem value="custom">Custom Header</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Authentication Type</Label>
                          <Input value={authTypeLabel((provider?.config as MemoryProviderConfig | null)?.auth?.type ?? 'none')} disabled readOnly />
                        </div>
                      )}

                      {/* Conditional credential fields — view mode */}
                      {!isEditMode &&
                        (() => {
                          const config = provider?.config as MemoryProviderConfig | null;
                          const creds = config?.auth?.credentials;
                          const type = config?.auth?.type;
                          if (!creds || !type || type === 'none') {
                            return null;
                          }

                          const RevealInput = ({fieldKey, label, value}: {fieldKey: string; label: string; value: string}) => (
                            <div className="space-y-2">
                              <Label>{label}</Label>
                              <div className="relative">
                                <Input value={value} type={revealedFields.has(fieldKey) ? 'text' : 'password'} disabled readOnly className="pr-10" />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleReveal(fieldKey)}
                                >
                                  {revealedFields.has(fieldKey) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                              </div>
                            </div>
                          );

                          if (type === 'token') {
                            return (
                              <div className="md:col-span-2">
                                <RevealInput fieldKey="api_key" label="API Key" value={creds.api_key ?? ''} />
                              </div>
                            );
                          }
                          if (type === 'bearer') {
                            return (
                              <div className="md:col-span-2">
                                <RevealInput fieldKey="access_token" label="Access Token" value={creds.access_token ?? ''} />
                              </div>
                            );
                          }
                          if (type === 'basic') {
                            return (
                              <>
                                <div className="space-y-2">
                                  <Label>Username</Label>
                                  <Input value={creds.username ?? ''} disabled readOnly />
                                </div>
                                <RevealInput fieldKey="password" label="Password" value={creds.password ?? ''} />
                              </>
                            );
                          }
                          if (type === 'custom') {
                            return (
                              <>
                                <div className="space-y-2">
                                  <Label>Header Name</Label>
                                  <Input value={creds.header_name ?? ''} disabled readOnly />
                                </div>
                                <RevealInput fieldKey="header_value" label="Header Value" value={creds.header_value ?? ''} />
                              </>
                            );
                          }
                          return null;
                        })()}

                      {/* Conditional credential fields — edit mode */}
                      {isEditMode && authType === 'token' && (
                        <div className="md:col-span-2">
                          <FormField
                            control={form.control}
                            name="token"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>API Key</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter API key" autoComplete="new-password" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {isEditMode && authType === 'bearer' && (
                        <div className="md:col-span-2">
                          <FormField
                            control={form.control}
                            name="access_token"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Access Token</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter access token" autoComplete="new-password" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {isEditMode && authType === 'basic' && (
                        <>
                          <FormField
                            control={form.control}
                            name="username"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter username" autoComplete="off" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="password"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter password" autoComplete="new-password" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {isEditMode && authType === 'custom' && (
                        <>
                          <FormField
                            control={form.control}
                            name="header_name"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Header Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="X-API-Key" autoComplete="off" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="header_value"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Header Value</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter header value" autoComplete="new-password" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
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
