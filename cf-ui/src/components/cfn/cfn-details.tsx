'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {ChevronDown, ChevronUp} from 'lucide-react';
import {swrKeys} from '@/lib/swr-config';
import {cfnApi} from '@/api/endpoints';
import type {Cfn, UpdateCfnRequest} from '@/api/types/cfn';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
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
  ip_address: z.string().min(1, 'IP Address is required'),
  port: z
    .string()
    .min(1, 'Port is required')
    .refine(
      (val) => {
        const num = parseInt(val, 10);
        return !isNaN(num) && num > 0 && num <= 65535;
      },
      {message: 'Port must be a number between 1 and 65535'}
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
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [expandedMAS, setExpandedMAS] = useState<Record<string, boolean>>({});
  const deleteDialog = useConfirmDialog<{cfn_id: string; cfn_name: string}>();

  const toggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaces((prev) => ({
      ...prev,
      [workspaceId]: !prev[workspaceId]
    }));
  };

  const toggleMAS = (masId: string) => {
    setExpandedMAS((prev) => ({
      ...prev,
      [masId]: !prev[masId]
    }));
  };

  const {data: cfn, error, isLoading, mutate} = useSWR<Cfn>(cfnId ? swrKeys.cfnDetails(cfnId) : null, () => cfnApi.get(cfnId as string));
  // const {data: usersData} = useSWR<ListUsersResponse>('users', () => userApi.list());

  // const getUserName = (userId: string | undefined) => {
  //   if (!userId || !usersData?.users) {
  //     return userId || 'Unknown';
  //   }
  //   const user = usersData.users.find((u: {id: string; username: string}) => u.id === userId);
  //   return user ? user.username : userId;
  // };

  const form = useForm({
    resolver: zodResolver(UpdateCfnFormSchema),
    defaultValues: {
      cfn_name: '',
      ip_address: '',
      port: ''
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
        ip_address: cfn.ip_address || '',
        port: cfn.port ? String(cfn.port) : ''
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
        toast.success(`Cognition Fabric Node "${data.cfn_name}" disabled successfully`);
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
        cfn_name: values.cfn_name,
        ip_address: values.ip_address,
        port: parseInt(values.port, 10)
      };

      await cfnApi.update(cfnId as string, payload);
      toast.success('Cognition Fabric Node updated successfully');
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
      ip_address: cfn?.ip_address || '',
      port: cfn?.port ? String(cfn.port) : ''
    });
    router.replace(routes.cfn.details(cfnId!));
  };

  return (
    <>
      <BasePage
        title={cfn?.cfn_name || 'CFN Details'}
        description="View details about your Cognition Fabric Node"
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

                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="ip_address"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel required>IP Address</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="192.168.1.100" autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2">
                          <Label>IP Address</Label>
                          <Input value={cfn?.ip_address || ''} disabled readOnly />
                        </div>
                      )}

                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="port"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel required>Port</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" placeholder="8080" autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2">
                          <Label>Port</Label>
                          <Input value={cfn?.port ? String(cfn.port) : ''} disabled readOnly />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Input value={cfn?.status || ''} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Enabled</Label>
                        <Input value={cfn?.enabled ? 'Yes' : 'No'} disabled readOnly />
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
                      {/* <div className="space-y-2">
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
                      </div> */}
                    </div>

                    {/* Configuration Details */}
                    {cfn?.config && (
                      <div className="mt-8 space-y-6">
                        <div className="border-t pt-6">
                          {/* Workspaces */}
                          {(cfn.config as any).workspaces && Array.isArray((cfn.config as any).workspaces) && (
                            <div className="mb-4">
                              <Label className="text-sm font-medium mb-2 block">
                                {(cfn.config as any).workspaces.length} Associated Workspace{(cfn.config as any).workspaces.length !== 1 ? 's' : ''}
                              </Label>
                              {(cfn.config as any).workspaces.length > 0 ? (
                                <div className="space-y-3">
                                  {(cfn.config as any).workspaces.map((workspace: any, index: number) => {
                                    const isExpanded = expandedWorkspaces[workspace.workspace_id] ?? false;
                                    return (
                                      <div
                                        key={workspace.workspace_id || index}
                                        className="rounded-md border p-4 space-y-4"
                                        style={{backgroundColor: 'hsl(216.7, 100%, 95.5%)'}}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="cursor-pointer flex-1" onClick={() => toggleWorkspace(workspace.workspace_id)}>
                                            <div className="font-medium">{workspace.workspace_name}</div>
                                            <div className="font-mono text-xs text-muted-foreground mt-1">{workspace.workspace_id}</div>
                                          </div>
                                          <button
                                            type="button"
                                            className="h-6 w-6 p-0 text-xs leading-none inline-flex items-center justify-center rounded bg-white hover:bg-gray-100 ml-2"
                                            onClick={() => toggleWorkspace(workspace.workspace_id)}
                                          >
                                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                          </button>
                                        </div>

                                        {isExpanded && (
                                          <div className="pt-4 border-t border-blue-200 space-y-4">
                                            {/* Cognitive Agents */}
                                            <div>
                                              <Label className="text-sm font-medium mb-2 block">
                                                {workspace.cognitive_agents && workspace.cognitive_agents.length > 0
                                                  ? `${workspace.cognitive_agents.length} Cognition Agent${workspace.cognitive_agents.length !== 1 ? 's' : ''}`
                                                  : 'Cognition Agents'}
                                              </Label>
                                              {workspace.cognitive_agents && workspace.cognitive_agents.length > 0 ? (
                                                workspace.cognitive_agents.map((agent: any, agentIndex: number) => (
                                                  <Input
                                                    key={agentIndex}
                                                    value={agent.name || agent.agent_name || agent.id || `Agent ${agentIndex + 1}`}
                                                    disabled
                                                    readOnly
                                                    className="mb-2"
                                                  />
                                                ))
                                              ) : (
                                                <Input value="None" disabled readOnly />
                                              )}
                                            </div>

                                            <div>
                                              <Label className="text-sm font-medium mb-3 block">
                                                {workspace.multi_agentic_systems && workspace.multi_agentic_systems.length > 0
                                                  ? `${workspace.multi_agentic_systems.length} Multi-Agentic System${workspace.multi_agentic_systems.length !== 1 ? 's' : ''}`
                                                  : 'Multi-Agentic Systems'}
                                              </Label>
                                              {workspace.multi_agentic_systems && workspace.multi_agentic_systems.length > 0 ? (
                                                <div className="space-y-3">
                                                  {workspace.multi_agentic_systems.map((mas: any, masIndex: number) => {
                                                    const isMASExpanded = expandedMAS[mas.id] ?? false;
                                                    return (
                                                      <div key={mas.id || masIndex} className="rounded-md border bg-white p-3 space-y-3">
                                                        <div className="flex items-start justify-between">
                                                          <div className="flex-1 cursor-pointer" onClick={() => toggleMAS(mas.id)}>
                                                            <div className="font-medium text-sm">{mas.name}</div>
                                                            {mas.description && (
                                                              <div className="text-xs text-muted-foreground mt-1">{mas.description}</div>
                                                            )}
                                                          </div>
                                                          <button
                                                            type="button"
                                                            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 ml-2"
                                                            onClick={() => toggleMAS(mas.id)}
                                                          >
                                                            {isMASExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                          </button>
                                                        </div>

                                                        {isMASExpanded && (
                                                          <div className="pt-3 border-t space-y-3">
                                                            {/* Shared Memory */}
                                                            {mas.shared_memory && (
                                                              <div className="bg-purple-50 rounded p-3">
                                                                <Label className="text-xs font-semibold mb-2 block">Shared Memory</Label>
                                                                <div className="space-y-1 text-xs">
                                                                  <div>
                                                                    <span className="text-muted-foreground">Provider:</span>{' '}
                                                                    <span className="font-medium">
                                                                      {mas.shared_memory.memory_provider_name || 'Unknown'}
                                                                    </span>
                                                                  </div>
                                                                  <div>
                                                                    <span className="text-muted-foreground">Enabled:</span>{' '}
                                                                    <span className={mas.shared_memory.enabled ? 'text-green-600' : 'text-gray-500'}>
                                                                      {mas.shared_memory.enabled ? 'Yes' : 'No'}
                                                                    </span>
                                                                  </div>
                                                                </div>
                                                              </div>
                                                            )}

                                                            {mas.agents && mas.agents.length > 0 && (
                                                              <div>
                                                                <Label className="text-xs font-semibold mb-2 block">
                                                                  {mas.agents.length} Agent{mas.agents.length !== 1 ? 's' : ''}
                                                                </Label>
                                                                <div className="space-y-2">
                                                                  {mas.agents.map((agent: any, agentIndex: number) => (
                                                                    <div key={agentIndex} className="bg-blue-50 rounded p-3">
                                                                      <div className="font-medium text-xs mb-2">{agent.agent_id}</div>
                                                                      {agent.agentic_memory && (
                                                                        <div className="text-xs space-y-1">
                                                                          <div>
                                                                            <span className="text-muted-foreground">Agentic Memory Provider:</span>{' '}
                                                                            <span className="font-medium">
                                                                              {agent.agentic_memory.memory_provider_name || 'Unknown'}
                                                                            </span>
                                                                          </div>
                                                                          <div>
                                                                            <span className="text-muted-foreground">Enabled:</span>{' '}
                                                                            <span
                                                                              className={
                                                                                agent.agentic_memory.enabled ? 'text-green-600' : 'text-gray-500'
                                                                              }
                                                                            >
                                                                              {agent.agentic_memory.enabled ? 'Yes' : 'No'}
                                                                            </span>
                                                                          </div>
                                                                        </div>
                                                                      )}
                                                                    </div>
                                                                  ))}
                                                                </div>
                                                              </div>
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <Input value="None" disabled readOnly />
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground italic">No workspaces associated</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
        title={`Disable ${deleteDialog.data?.cfn_name || 'Cognition Fabric Node'}`}
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
