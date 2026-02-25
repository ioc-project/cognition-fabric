'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm, useFieldArray} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {swrKeys} from '@/lib/swr-config';
import {masApi, workspaceApi} from '@/api/endpoints';
import type {MAS, UpdateMASRequest} from '@/api/types/mas';
import type {Workspace} from '@/api/types/workspace';
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
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {toast} from 'sonner';
import {AgentsList} from './agents-list';
import {CollapsibleJsonField} from './collapsible-json-field';

const AgentFormSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  url: z.string().url('Must be a valid URL'),
  remote_memory_provider_id: z.string().min(1, 'Remote Memory Provider is required')
});

const UpdateMASFormSchema = z.object({
  name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
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
    ),
  mcp_servers: z
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
  const [mcpServersExpanded, setMcpServersExpanded] = useState(true);
  const [agentExpandedState, setAgentExpandedState] = useState<Record<string, boolean>>({});
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const {
    data: mas,
    error,
    isLoading,
    mutate
  } = useSWR<MAS>(workspaceId && masId ? swrKeys.masDetails(workspaceId, masId) : null, () => masApi.get(workspaceId as string, masId as string));
  const {data: workspace, error: workspaceError} = useSWR<Workspace | null>(workspaceId ? swrKeys.workspace(workspaceId) : null, () =>
    workspaceApi.get(workspaceId as string)
  );
  const {providers = []} = useMemoryProviders();

  const ootbMemoryProvider = providers.find((p) => p.enabled);
  const userMemoryProviders = providers.map((p) => ({id: p.memory_provider_id, provider_name: p.memory_provider_name}));

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateMASFormSchema),
    defaultValues: {
      name: '',
      description: '',
      agents: [],
      config: '',
      mcp_servers: ''
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
      const mcp_servers = typeof masConfig === 'object' && masConfig !== null && 'mcp_servers' in masConfig ? masConfig.mcp_servers : undefined;

      const cleanConfig = typeof masConfig === 'object' && masConfig !== null ? {...masConfig} : {};
      if ('uses_a2a' in cleanConfig) {
        delete cleanConfig.uses_a2a;
      }
      if ('memory_provider_id' in cleanConfig) {
        delete cleanConfig.memory_provider_id;
      }
      if ('mcp_servers' in cleanConfig) {
        delete cleanConfig.mcp_servers;
      }

      // Convert agents object to array format for form
      const agentsArray =
        mas.agents && Object.keys(mas.agents).length > 0
          ? Object.entries(mas.agents).map(([name, agentData]: [string, any]) => ({
              name,
              url: agentData.url || '',
              remote_memory_provider_id: agentData.remote_memory_provider_id || ''
            }))
          : [];

      form.reset({
        name: mas.name,
        description: mas.description || '',
        agents: agentsArray,
        config: Object.keys(cleanConfig).length > 0 ? JSON.stringify(cleanConfig, null, 2) : '',
        mcp_servers: mcp_servers && typeof mcp_servers === 'object' && Object.keys(mcp_servers).length > 0 ? JSON.stringify(mcp_servers, null, 2) : ''
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
      // Convert agents array to object payload
      const agentsPayload = (values.agents || []).reduce<Record<string, unknown>>((acc, agent) => {
        const key = agent.name.trim();
        if (!key) {
          return acc;
        }
        acc[key] = {
          url: agent.url,
          remote_memory_provider_id: agent.remote_memory_provider_id
        };
        return acc;
      }, {});

      const configPayload = values.config && values.config.trim() ? (JSON.parse(values.config) as Record<string, unknown>) : {};
      const mcpServersPayload =
        values.mcp_servers && values.mcp_servers.trim() ? (JSON.parse(values.mcp_servers) as Record<string, unknown>) : undefined;

      const finalConfig = {
        ...configPayload,
        uses_a2a: true, // Always true based on assumptions
        ...(ootbMemoryProvider && {memory_provider_id: ootbMemoryProvider.memory_provider_id}),
        ...(mcpServersPayload && {mcp_servers: mcpServersPayload})
      };

      const payload: UpdateMASRequest = {
        name: values.name,
        description: values.description,
        ...(agentsPayload && {agents: agentsPayload}),
        ...(Object.keys(finalConfig).length > 0 && {config: finalConfig})
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
    const mcp_servers = typeof masConfig === 'object' && masConfig !== null && 'mcp_servers' in masConfig ? masConfig.mcp_servers : undefined;

    const cleanConfig = typeof masConfig === 'object' && masConfig !== null ? {...masConfig} : {};
    if ('uses_a2a' in cleanConfig) {
      delete cleanConfig.uses_a2a;
    }
    if ('memory_provider_id' in cleanConfig) {
      delete cleanConfig.memory_provider_id;
    }
    if ('mcp_servers' in cleanConfig) {
      delete cleanConfig.mcp_servers;
    }

    // Convert agents object to array format for form
    const agentsArray =
      mas?.agents && Object.keys(mas.agents).length > 0
        ? Object.entries(mas.agents).map(([name, agentData]: [string, any]) => ({
            name,
            url: agentData.url || '',
            remote_memory_provider_id: agentData.remote_memory_provider_id || ''
          }))
        : [];

    form.reset({
      name: mas?.name || '',
      description: mas?.description || '',
      agents: agentsArray,
      config: Object.keys(cleanConfig).length > 0 ? JSON.stringify(cleanConfig, null, 2) : '',
      mcp_servers: mcp_servers && typeof mcp_servers === 'object' && Object.keys(mcp_servers).length > 0 ? JSON.stringify(mcp_servers, null, 2) : ''
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
                        <Label>Memory Provider</Label>
                        <Input value={ootbMemoryProvider?.memory_provider_name || 'Outshift Memory Provider'} disabled readOnly />
                      </div>
                    </div>

                    <AgentsList
                      agents={agentFields}
                      control={form.control}
                      watch={form.watch}
                      isEditMode={isEditMode}
                      agentExpandedState={agentExpandedState}
                      onToggleExpand={(id) => setAgentExpandedState((prev) => ({...prev, [id]: !prev[id]}))}
                      onAddAgent={isEditMode ? () => appendAgent({name: '', url: '', remote_memory_provider_id: ''}) : undefined}
                      onRemoveAgent={isEditMode ? removeAgent : undefined}
                      masAgentsData={!isEditMode && mas?.agents ? mas.agents : undefined}
                      userMemoryProviders={userMemoryProviders}
                    />

                    <div className="space-y-6 border-t pt-6">
                      <FormField
                        control={form.control}
                        name="config"
                        render={({field}) => {
                          const cleanConfigValue = (() => {
                            if (!isEditMode && mas?.config) {
                              const masConfig = mas.config;
                              const cleanConfig = typeof masConfig === 'object' && masConfig !== null ? {...masConfig} : {};
                              if ('uses_a2a' in cleanConfig) {
                                delete cleanConfig.uses_a2a;
                              }
                              if ('memory_provider_id' in cleanConfig) {
                                delete cleanConfig.memory_provider_id;
                              }
                              if ('mcp_servers' in cleanConfig) {
                                delete cleanConfig.mcp_servers;
                              }
                              return Object.keys(cleanConfig).length > 0 ? JSON.stringify(cleanConfig, null, 2) : 'None configured';
                            }
                            return field.value || '';
                          })();

                          return (
                            <CollapsibleJsonField
                              label="MAS Config"
                              value={cleanConfigValue}
                              isExpanded={masConfigExpanded}
                              onToggleExpand={() => setMasConfigExpanded(!masConfigExpanded)}
                              isEditMode={isEditMode}
                              field={field}
                              placeholder={`{
  "orchestration": "sequential",
  "retry_policy": {
    "max_retries": 3
  },
  "timeout": 30000
}`}
                            />
                          );
                        }}
                      />

                      <FormField
                        control={form.control}
                        name="mcp_servers"
                        render={({field}) => {
                          const mcpValue = (() => {
                            if (!isEditMode && mas?.config) {
                              const mcp =
                                typeof mas.config === 'object' && mas.config !== null && 'mcp_servers' in mas.config
                                  ? mas.config.mcp_servers
                                  : undefined;
                              return mcp && typeof mcp === 'object' && Object.keys(mcp).length > 0 ? JSON.stringify(mcp, null, 2) : 'None configured';
                            }
                            return field.value || '';
                          })();

                          return (
                            <CollapsibleJsonField
                              label="MCP Servers"
                              value={mcpValue}
                              isExpanded={mcpServersExpanded}
                              onToggleExpand={() => setMcpServersExpanded(!mcpServersExpanded)}
                              isEditMode={isEditMode}
                              field={field}
                              placeholder={`{
  "MCP-Server-1": {
    "url": "https://192.168.1.200:3000"
  }
}`}
                            />
                          );
                        }}
                      />
                    </div>

                    {/* System Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
                      <div className="space-y-2">
                        <Label>Workspace ID</Label>
                        <Input value={mas?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
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
        title="Delete Multi-Agentic System"
        description={deleteError ?? `Are you sure you want to delete "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
