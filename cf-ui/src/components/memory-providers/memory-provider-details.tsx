'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {swrKeys} from '@/lib/swr-config';
import {memoryProviderApi} from '@/api/endpoints';
import type {MemoryProvider, UpdateMemoryProviderRequest} from '@/api/types/memory-provider';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {toast} from 'sonner';

const UpdateMemoryProviderFormSchema = z.object({
  memory_provider_name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters').optional(),
  description: z.string().optional(),
  config: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') {
          return true;
        }
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      {message: 'Must be valid JSON'}
    )
});

export default function MemoryProviderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawProviderId = params?.providerId as string | string[] | undefined;
  const providerId = Array.isArray(rawProviderId) ? rawProviderId[0] : rawProviderId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const deleteDialog = useConfirmDialog<{id: string; memory_provider_name: string}>();

  const {
    data: provider,
    error,
    isLoading,
    mutate
  } = useSWR<MemoryProvider>(providerId ? swrKeys.memoryProviderDetails(providerId) : null, () => memoryProviderApi.get(providerId as string));

  const form = useForm({
    resolver: zodResolver(UpdateMemoryProviderFormSchema),
    defaultValues: {
      memory_provider_name: '',
      description: '',
      config: ''
    }
  });

  useEffect(() => {
    if (searchParams.get('edit') === 'true' && provider?.enabled) {
      setIsEditMode(true);
    }
  }, [searchParams, provider?.enabled]);

  useEffect(() => {
    if (provider) {
      form.reset({
        description: provider.description || '',
        memory_provider_name: provider.memory_provider_name,
        config: provider.config ? JSON.stringify(provider.config, null, 2) : ''
      });
    }
  }, [provider, form]);

  useEffect(() => {
    if (!providerId) {
      router.replace('/not-found');
    }
  }, [providerId, router]);

  const crumbs = provider
    ? [
        {link: routes.memoryProviders.list, text: 'Memory Providers'},
        {link: '', text: provider.memory_provider_name || 'Provider', active: true}
      ]
    : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await memoryProviderApi.delete(data.id);
        toast.success(`Memory Provider "${data.memory_provider_name}" removed successfully`);
        await globalMutate(swrKeys.memoryProviders());
        router.push(routes.memoryProviders.list);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  const handleSave = async (values: z.infer<typeof UpdateMemoryProviderFormSchema>) => {
    try {
      const payload: UpdateMemoryProviderRequest = {};

      if (values.memory_provider_name) {
        payload.memory_provider_name = values.memory_provider_name;
      }

      if (values.description !== undefined) {
        payload.description = values.description;
      }

      if (values.config && values.config.trim()) {
        payload.config = JSON.parse(values.config) as Record<string, unknown>;
      }

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
    form.reset({
      memory_provider_name: provider?.memory_provider_name,
      description: provider?.description || '',
      config: provider?.config ? JSON.stringify(provider.config, null, 2) : ''
    });
    router.replace(routes.memoryProviders.details(providerId as string));
  };

  return (
    <>
      <BasePage
        title={provider?.memory_provider_name || 'Memory Provider Details'}
        description="View and manage memory provider details"
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          provider && (
            <DetailsPageActions
              onDelete={() => deleteDialog.open({id: provider.memory_provider_id, memory_provider_name: provider.memory_provider_name})}
              onEdit={() => setIsEditMode(true)}
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
                  <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Provider ID</Label>
                        <Input value={provider?.memory_provider_id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>

                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="memory_provider_name"
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
                          <Input value={provider?.memory_provider_name || ''} disabled readOnly />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Enabled</Label>
                        <Input value={provider?.enabled ? 'Yes' : 'No'} disabled readOnly />
                      </div>

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

                      <div className="md:col-span-2">
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="config"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Configuration (JSON)</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    className="font-mono text-sm min-h-[200px] resize-y"
                                    placeholder="Enter provider configuration as JSON"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <div className="space-y-2">
                            <Label>Configuration</Label>
                            <Textarea
                              value={provider?.config ? JSON.stringify(provider.config, null, 2) : ''}
                              disabled
                              readOnly
                              className="font-mono text-sm min-h-[200px] resize-none"
                            />
                          </div>
                        )}
                      </div>

                      {/* <div className="space-y-2">
                        <Label>Created By</Label>
                        <Input value={provider?.created_by || 'Unknown'} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Created At</Label>
                        <Input
                          value={provider?.created_at ? new Date(provider.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
                          disabled
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Updated At</Label>
                        <Input
                          value={provider?.updated_at ? new Date(provider.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
                          disabled
                          readOnly
                        />
                      </div> */}
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
        title={`Remove ${deleteDialog.data?.memory_provider_name || 'Memory Provider'}`}
        description={deleteError ?? `Are you sure you want to remove "${deleteDialog.data?.memory_provider_name}"? This action cannot be undone.`}
        confirmText="Remove"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
