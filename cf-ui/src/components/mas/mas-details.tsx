'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm, useFieldArray} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {swrKeys} from '@/lib/swr-config';
import {masApi, workspaceApi} from '@/api/endpoints';
import type {MultiAgenticSystem, MultiAgenticSystemUpdate} from '@/api/endpoints/mas';
import type {Workspace} from '@/api/types/workspace';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes, breadcrumbs} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {toast} from 'sonner';
import {AgentsList} from './agents-list';
import {CollapsibleJsonField} from './collapsible-json-field';

const AgentFormSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required'),
  agentic_memory_provider_id: z.string().optional()
});

const UpdateMASFormSchema = z.object({
  name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  shared_memory_provider_id: z.string().optional(),
  agents: z.array(AgentFormSchema).optional().default([]),
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

type FormValues = z.infer<typeof UpdateMASFormSchema>;

export default function MASDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawWorkspaceId = params?.id as string | string[] | undefined;
  const rawMasId = (params as Record<string, string | string[] | undefined>)?.masId;
  const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
  const masId = Array.isArray(rawMasId) ? rawMasId[0] : rawMasId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [masConfigExpanded, setMasConfigExpanded] = useState(true);
  const [agentExpandedState, setAgentExpandedState] = useState<Record<string, boolean>>({});
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const {
    data: mas,
    error,
    isLoading,
    mutate
  } = useSWR<MultiAgenticSystem>(workspaceId && masId ? swrKeys.masDetails(workspaceId, masId) : null, () =>
    masApi.get(workspaceId as string, masId as string)
  );
  const {data: workspace, error: workspaceError} = useSWR<Workspace | null>(workspaceId ? swrKeys.workspace(workspaceId) : null, () =>
    workspaceApi.get(workspaceId as string)
  );
  const {providers = []} = useMemoryProviders();

  // const ootbMemoryProvider = providers.find((p) => p.enabled);
  const userMemoryProviders = providers.map((p) => ({id: p.memory_provider_id, provider_name: p.memory_provider_name}));

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateMASFormSchema),
    defaultValues: {
      name: '',
      description: '',
      shared_memory_provider_id: '',
      agents: [],
      config: ''
    }
  });

  const {
    fields: agentFields,
    append: appendAgent,
    remove: removeAgent
  } = useFieldArray({
    control: form.control,
    name: 'agents'
  });

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (mas) {
      const masConfig = mas.config || {};

      const cleanConfig = typeof masConfig === 'object' && masConfig !== null ? {...masConfig} : {};

      const agentsArray = mas.agents
        ? mas.agents.map((agent) => ({
            agent_id: agent.agent_id,
            agentic_memory_provider_id: agent.agentic_memory?.memory_provider_id || ''
          }))
        : [];

      form.reset({
        name: mas.name,
        description: mas.description || '',
        shared_memory_provider_id: mas.shared_memory?.memory_provider_id || '',
        agents: agentsArray,
        config: Object.keys(cleanConfig).length > 0 ? JSON.stringify(cleanConfig, null, 2) : ''
      });
    }
  }, [mas, form]);

  if (workspaceError) {
    console.warn('Failed to load workspace:', workspaceError);
  }

  useEffect(() => {
    if (!workspaceId || !masId) {
      router.replace('/not-found');
    }
  }, [workspaceId, masId, router]);

  const crumbs =
    workspace && workspaceId
      ? [
          {link: routes.workspaces.mas.list(workspaceId), text: 'Multi-Agentic Systems'},
          {link: '', text: mas?.name || 'MAS', active: true}
        ]
      : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await masApi.delete(workspaceId!, data.id);
        toast.success(`Multi-Agentic System "${data.name}" deleted successfully`);
        await globalMutate(swrKeys.mas(workspaceId!));
        router.push(routes.workspaces.mas.list(workspaceId!));
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  const handleSave = async (values: FormValues) => {
    try {
      const parseJsonField = (value?: string): Record<string, unknown> | undefined => {
        if (!value || value.trim() === '') {
          return undefined;
        }
        return JSON.parse(value) as Record<string, unknown>;
      };

      const agentsPayload = (values.agents || []).map((agent) => ({
        agent_id: agent.agent_id,
        ...(agent.agentic_memory_provider_id && {agentic_memory_provider_id: agent.agentic_memory_provider_id})
      }));

      const configPayload = parseJsonField(values.config) || {};

      const payload: MultiAgenticSystemUpdate = {
        name: values.name,
        description: values.description,
        ...(values.shared_memory_provider_id && {shared_memory_provider_id: values.shared_memory_provider_id}),
        ...(agentsPayload.length > 0 && {agents: agentsPayload}),
        ...(Object.keys(configPayload).length > 0 && {config: configPayload})
      };

      await masApi.update(workspaceId as string, masId as string, payload);
      toast.success('Multi-Agentic System updated successfully');
      await mutate();
      setIsEditMode(false);
      router.replace(routes.workspaces.mas.details(workspaceId!, masId!));
    } catch (err) {
      const errorMessage = parseError(err);
      toast.error(errorMessage);
      throw err;
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    const masConfig = mas?.config || {};

    const cleanConfig = typeof masConfig === 'object' && masConfig !== null ? {...masConfig} : {};

    // Convert agents array from API to form format
    const agentsArray = mas?.agents
      ? mas.agents.map((agent) => ({
          agent_id: agent.agent_id,
          agentic_memory_provider_id: agent.agentic_memory?.memory_provider_id || ''
        }))
      : [];

    form.reset({
      name: mas?.name || '',
      description: mas?.description || '',
      shared_memory_provider_id: mas?.shared_memory?.memory_provider_id || '',
      agents: agentsArray,
      config: Object.keys(cleanConfig).length > 0 ? JSON.stringify(cleanConfig, null, 2) : ''
    });
    router.replace(routes.workspaces.mas.details(workspaceId!, masId!));
  };

  return (
    <>
      <BasePage
        title={mas?.name || 'MAS Details'}
        description="View details about your multi-agentic system"
        useBreadcrumbs
        breadcrumbs={crumbs || (workspaceId ? breadcrumbs.workspaceMAS(workspaceId, workspace?.name || '') : undefined)}
        callToAction={
          mas && (
            <DetailsPageActions
              onDelete={() => deleteDialog.open({id: mas.id, name: mas.name})}
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
          data={mas}
          error={error}
          itemName="MAS details"
          customIsLoading={isLoading}
          errorListStateProps={{
            title: 'Failed to load MAS details'
          }}
          emptyListStateProps={{
            title: 'No MAS details found'
          }}
        >
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="name"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel required>Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input value={mas?.name || ''} disabled readOnly />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>ID</Label>
                        <Input value={mas?.id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>

                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="description"
                          render={({field}) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="space-y-2 md:col-span-2">
                          <Label>Description</Label>
                          <Input value={mas?.description || ''} disabled readOnly />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Shared Memory Provider</Label>
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="shared_memory_provider_id"
                            render={({field}) => (
                              <FormItem>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a memory provider" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {userMemoryProviders.length === 0 ? (
                                      <div className="py-2 px-2 text-sm text-muted-foreground">No shared memory providers available</div>
                                    ) : (
                                      userMemoryProviders.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                          {provider.provider_name}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <Input value={mas?.shared_memory?.memory_provider_name || 'None'} disabled readOnly />
                        )}
                      </div>
                    </div>

                    <AgentsList
                      agents={agentFields}
                      control={form.control}
                      watch={form.watch}
                      isEditMode={isEditMode}
                      agentExpandedState={agentExpandedState}
                      onToggleExpand={(id) => setAgentExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
                      onAddAgent={isEditMode ? () => appendAgent({agent_id: '', agentic_memory_provider_id: ''}) : undefined}
                      onRemoveAgent={isEditMode ? removeAgent : undefined}
                      masAgentsData={!isEditMode && mas?.agents ? mas.agents : undefined}
                      userMemoryProviders={userMemoryProviders}
                    />

                    <div className="space-y-6 border-t pt-6">
                      <FormField
                        control={form.control}
                        name="config"
                        render={({field}) => (
                          <CollapsibleJsonField
                            label="Config"
                            value={field.value || ''}
                            isExpanded={masConfigExpanded}
                            onToggleExpand={() => setMasConfigExpanded(!masConfigExpanded)}
                            isEditMode={isEditMode}
                            field={field}
                            placeholder={`{
  "key": "value"
}`}
                          />
                        )}
                      />
                    </div>

                    {/* System Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
                      <div className="space-y-2">
                        <Label>Workspace ID</Label>
                        <Input value={mas?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                      {/* <div className="space-y-2">
                        <Label>Created By</Label>
                        <Input value={mas?.created_by || 'Unknown'} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Created At</Label>
                        <Input
                          value={mas?.created_at ? new Date(mas.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
                          disabled
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Updated At</Label>
                        <Input
                          value={mas?.updated_at ? new Date(mas.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
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
        title="Delete Multi-Agentic System"
        description={deleteError ?? `Are you sure you want to delete "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
