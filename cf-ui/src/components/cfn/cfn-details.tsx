'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {swrKeys} from '@/lib/swr-config';
import {cfnApi, workspaceApi, userApi} from '@/api/endpoints';
import type {Cfn, UpdateCfnRequest} from '@/api/types/cfn';
import type {Workspace} from '@/api/types/workspace';
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
  const rawWorkspaceId = params?.id as string | string[] | undefined;
  const rawCfnId = (params as Record<string, string | string[] | undefined>)?.cfnId;
  const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
  const cfnId = Array.isArray(rawCfnId) ? rawCfnId[0] : rawCfnId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const deleteDialog = useConfirmDialog<{cfn_id: string; cfn_name: string}>();

  const {
    data: cfn,
    error,
    isLoading,
    mutate
  } = useSWR<Cfn>(workspaceId && cfnId ? swrKeys.cfnDetails(workspaceId, cfnId) : null, () => cfnApi.get(workspaceId as string, cfnId as string));
  const {data: workspace, error: workspaceError} = useSWR<Workspace | null>(workspaceId ? swrKeys.workspace(workspaceId) : null, () =>
    workspaceApi.get(workspaceId as string)
  );
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
        mgmt_host_ip: cfn.mgmt_host_ip || '',
        mgmt_port: cfn.mgmt_port !== undefined ? String(cfn.mgmt_port) : '',
        cfn_config: cfn.cfn_config ? JSON.stringify(cfn.cfn_config, null, 2) : ''
      });
    }
  }, [cfn, form]);

  if (workspaceError) {
    console.warn('Failed to load workspace:', workspaceError);
  }

  useEffect(() => {
    if (!workspaceId || !cfnId) {
      router.replace('/not-found');
    }
  }, [workspaceId, cfnId, router]);

  const crumbs =
    workspace && workspaceId
      ? [
          {link: routes.workspaces.cfn.list(workspaceId), text: 'Cognitive Fabric Nodes'},
          {link: '', text: cfn?.cfn_name || 'CFN', active: true}
        ]
      : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await cfnApi.delete(workspaceId as string, data.cfn_id);
        toast.success(`Cognitive Fabric Node "${data.cfn_name}" deleted successfully`);
        await globalMutate(swrKeys.cfn(workspaceId!));
        router.push(routes.workspaces.cfn.list(workspaceId!));
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

      if (values.mgmt_host_ip) {
        payload.mgmt_host_ip = values.mgmt_host_ip;
      }

      if (values.mgmt_port) {
        payload.mgmt_port = parseInt(String(values.mgmt_port), 10);
      }

      if (values.cfn_config && values.cfn_config.trim()) {
        payload.cfn_config = JSON.parse(values.cfn_config) as Record<string, unknown>;
      }

      await cfnApi.update(workspaceId as string, cfnId as string, payload);
      toast.success('Cognitive Fabric Node updated successfully');
      await mutate();
      setIsEditMode(false);
      // Remove edit param from URL
      router.replace(routes.workspaces.cfn.details(workspaceId!, cfnId!));
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
      mgmt_host_ip: cfn?.mgmt_host_ip || '',
      mgmt_port: cfn?.mgmt_port !== undefined ? String(cfn.mgmt_port) : '',
      cfn_config: cfn?.cfn_config ? JSON.stringify(cfn.cfn_config, null, 2) : ''
    });
    // Remove edit param from URL
    router.replace(routes.workspaces.cfn.details(workspaceId!, cfnId!));
  };

  return (
    <>
      <BasePage
        title={cfn?.cfn_name || 'CFN Details'}
        description="View details about your Cognitive Fabric Node"
        useBreadcrumbs
        breadcrumbs={crumbs || (workspaceId ? breadcrumbs.workspaceCFN(workspaceId, workspace?.name || '') : undefined)}
        callToAction={
          cfn && (
            <DetailsPageActions
              onDelete={() => deleteDialog.open({cfn_id: cfn.cfn_id, cfn_name: cfn.cfn_name})}
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

                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="mgmt_host_ip"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel>Management Host IP</FormLabel>
                              <FormControl>
                                <Input {...field} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2">
                          <Label>Management Host IP</Label>
                          <Input value={cfn?.mgmt_host_ip || ''} disabled readOnly />
                        </div>
                      )}

                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="mgmt_port"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel>Management Port</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  max="65535"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                  value={field.value || ''}
                                  autoComplete="off"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2">
                          <Label>Management Port</Label>
                          <Input value={cfn?.mgmt_port || ''} disabled readOnly />
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
                            <Label>Configuration (JSON)</Label>
                            <Textarea
                              value={cfn?.cfn_config ? JSON.stringify(cfn.cfn_config, null, 2) : ''}
                              disabled
                              readOnly
                              className="font-mono text-sm min-h-[150px] resize-none"
                            />
                          </div>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <div className="space-y-2">
                          <Label>Cloud Configuration (JSON)</Label>
                          <Textarea
                            value={cfn?.cloud_config ? JSON.stringify(cfn.cloud_config, null, 2) : ''}
                            disabled
                            readOnly
                            className="font-mono text-sm min-h-[150px] resize-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Input value={cfn?.status || ''} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Blocked</Label>
                        <Input value={cfn?.blocked ? 'Yes' : 'No'} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Workspace ID</Label>
                        <Input value={cfn?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
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
                        <Input value={getUserName(cfn?.created_by)} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Updated By</Label>
                        <Input value={getUserName(cfn?.updated_by)} disabled readOnly />
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
        title="Delete Cognitive Fabric Node"
        description={deleteError ?? `Are you sure you want to delete "${deleteDialog.data?.cfn_name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
