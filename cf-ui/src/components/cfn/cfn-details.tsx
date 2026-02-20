'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {swrKeys} from '@/lib/swr-config';
import {cfnApi, userApi} from '@/api/endpoints';
import type {Cfn, UpdateCfnRequest} from '@/api/types/cfn';
import type {ListUsersResponse} from '@/api/types/users';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes, breadcrumbs} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS, parseError} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {toast} from 'sonner';

const UpdateCfnFormSchema = z.object({
  cfn_name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters').optional(),
  mgmt_host_ip: z.string().optional(),
  mgmt_port: z.string().optional(),
  cfn_config: z
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

export default function CfnDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawCfnId = params?.cfnId as string | string[] | undefined;
  const cfnId = Array.isArray(rawCfnId) ? rawCfnId[0] : rawCfnId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const deleteDialog = useConfirmDialog<{cfn_id: string; cfn_name: string}>();

  const {data: cfn, error, isLoading, mutate} = useSWR<Cfn>(cfnId ? swrKeys.cfnDetails(cfnId) : null, () => cfnApi.get(cfnId as string));
  const {data: usersData} = useSWR<ListUsersResponse>('users', () => userApi.list());

  const getUserName = (userId: string | undefined) => {
    if (!userId || !usersData?.users) {
      return userId || 'Unknown';
    }
    const user = usersData.users.find((u) => u.id === userId);
    return user ? user.username : userId;
  };

  const form = useForm({
    resolver: zodResolver(UpdateCfnFormSchema),
    defaultValues: {
      cfn_name: '',
      mgmt_host_ip: '',
      mgmt_port: '',
      cfn_config: ''
    }
  });

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (cfn) {
      form.reset({
        cfn_name: cfn.cfn_name,
        cfn_config: cfn.config ? JSON.stringify(cfn.config, null, 2) : ''
      });
    }
  }, [cfn, form]);

  useEffect(() => {
    if (!cfnId) {
      router.replace('/not-found');
    }
  }, [cfnId, router]);

  const crumbs = breadcrumbs.cfnDetails(cfn?.cfn_name || 'CFN');

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await cfnApi.delete(data.cfn_id);
        toast.success(`Cognitive Fabric Node "${data.cfn_name}" disabled successfully`);
        await globalMutate(swrKeys.cfn());
        router.push(routes.cfn.list);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  const handleSave = async (values: z.infer<typeof UpdateCfnFormSchema>) => {
    try {
      const payload: UpdateCfnRequest = {
        cfn_name: values.cfn_name
      };

      if (values.cfn_config && values.cfn_config.trim()) {
        payload.cfn_config = JSON.parse(values.cfn_config) as Record<string, unknown>;
      }

      await cfnApi.update(cfnId as string, payload);
      toast.success('Cognitive Fabric Node updated successfully');
      await mutate();
      await globalMutate(swrKeys.cfn());
      setIsEditMode(false);
      router.replace(routes.cfn.details(cfnId!));
    } catch (err) {
      const errorMessage = parseError(err);
      toast.error(errorMessage);
      throw err;
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    form.reset({
      cfn_name: cfn?.cfn_name,
      cfn_config: cfn?.config ? JSON.stringify(cfn.config, null, 2) : ''
    });
    router.replace(routes.cfn.details(cfnId!));
  };

  return (
    <>
      <BasePage
        title={cfn?.cfn_name || 'CFN Details'}
        description="View details about your Cognitive Fabric Node"
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          cfn && (
            <DetailsPageActions
              onDelete={() => deleteDialog.open({cfn_id: cfn.cfn_id, cfn_name: cfn.cfn_name})}
              onEdit={() => setIsEditMode(true)}
              isEditMode={isEditMode}
              onSave={form.handleSubmit(handleSave)}
              onCancelEdit={handleCancelEdit}
              isSaving={form.formState.isSubmitting}
              deleteLabel="Disable"
            />
          )
        }
      >
        <ConditionalSWRRenderer
          data={cfn}
          error={error}
          itemName="CFN details"
          customIsLoading={isLoading}
          errorListStateProps={{
            title: 'Failed to load CFN details'
          }}
          emptyListStateProps={{
            title: 'No CFN details found'
          }}
        >
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>CFN ID</Label>
                        <Input value={cfn?.cfn_id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>

                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="cfn_name"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel>CFN Name</FormLabel>
                              <FormControl>
                                <Input {...field} maxLength={100} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2">
                          <Label>CFN Name</Label>
                          <Input value={cfn?.cfn_name || ''} disabled readOnly />
                        </div>
                      )}

                      <div className="md:col-span-2">
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="cfn_config"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Configuration (JSON)</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    className="font-mono text-sm min-h-[150px] resize-y"
                                    placeholder="Leave empty or enter JSON configuration"
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
                              value={cfn?.config ? JSON.stringify(cfn.config, null, 2) : ''}
                              disabled
                              readOnly
                              className="font-mono text-sm min-h-[150px] resize-none"
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Input value={cfn?.status || ''} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Enabled</Label>
                        <Input value={cfn?.enabled ? 'Yes' : 'No'} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Workspace IDs</Label>
                        <Input value={cfn?.workspace_ids?.join(', ') || 'None'} disabled readOnly className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label>Last Seen</Label>
                        <Input
                          value={cfn?.last_seen ? new Date(cfn.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Never'}
                          disabled
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Created At</Label>
                        <Input
                          value={cfn?.created_at ? new Date(cfn.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
                          disabled
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Updated At</Label>
                        <Input
                          value={cfn?.updated_at ? new Date(cfn.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
                          disabled
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Created By</Label>
                        <Input value={getUserName(cfn?.created_by ?? undefined)} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Updated By</Label>
                        <Input value={getUserName(cfn?.updated_by ?? undefined)} disabled readOnly />
                      </div>
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
        title={`Disable ${deleteDialog.data?.cfn_name || 'Cognitive Fabric Node'}`}
        description={
          deleteError ??
          `Are you sure you want to disable "${deleteDialog.data?.cfn_name}"? The node will be removed and cannot reconnect until you re-register it.`
        }
        confirmText="Disable"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
