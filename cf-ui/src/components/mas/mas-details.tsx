'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm, useFieldArray} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {swrKeys} from '@/lib/swr-config';
import {masApi} from '@/api/endpoints';
import type {MultiAgenticSystem, MultiAgenticSystemUpdate} from '@/api/endpoints/mas';
import {Button} from '@/components/ui/button';
import {BasePage} from '@/components/ui/base-page';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import {CopyableInput} from '@/components/ui/copyable-input';
import {Badge} from '@/components/ui/badge';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError, DATE_TIME_FORMAT_OPTIONS, validateJSON, formatJson} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {toast} from 'sonner';
import {Network, BarChart3, Bot, BrainCircuit, HardDrive, ChevronDown, ChevronUp, Unlink} from 'lucide-react';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {MASAuditLog} from './mas-audit-log';
import {MASAssociateCEModal} from './mas-associate-ce-modal';
import {AgentsList} from './agents-list';
import {UpdateMASFormSchema, type FormValues} from './mas-form-schema';

export default function MASDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const {defaultWorkspaceId, isLoading: isWorkspaceLoading} = useDefaultWorkspace();

  const rawMasId = (params as Record<string, string | string[] | undefined>)?.masId;
  const workspaceId = defaultWorkspaceId;
  const masId = Array.isArray(rawMasId) ? rawMasId[0] : rawMasId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [masConfigExpanded, setMasConfigExpanded] = useState(true);
  const [associateModalOpen, setAssociateModalOpen] = useState(false);
  const [selectedCEIds, setSelectedCEIds] = useState<string[]>([]);
  const [isAssociating, setIsAssociating] = useState(false);
  const [disassociatingId, setDisassociatingId] = useState<string | null>(null);
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
  const {providers = []} = useMemoryProviders();
  const {cognitionEngines = []} = useCognitionEngines();

  const userMemoryProviders = providers.map((p) => ({id: p.id, provider_name: p.name}));
  const sharedMemoryProviders = userMemoryProviders.filter((p) => p.provider_name === 'ioc-memory-provider');
  const associatedCeIds = new Set(mas?.cognition_engines?.map((ce) => ce.ce_id) ?? []);
  const availableCEs = cognitionEngines.filter((ce) => !associatedCeIds.has(ce.id));

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateMASFormSchema),
    defaultValues: {name: '', description: '', shared_memory_provider_id: '', agents: [], config: ''}
  });

  const {fields: agentFields, append: appendAgent, remove: removeAgent} = useFieldArray({control: form.control, name: 'agents'});

  const buildFormValues = (m: MultiAgenticSystem | undefined): FormValues => {
    const cleanConfig = typeof m?.config === 'object' && m.config !== null ? {...m.config} : {};
    return {
      name: m?.name || '',
      description: m?.description || '',
      shared_memory_provider_id: m?.shared_memory?.id || '',
      agents: (m?.agents || []).map((agent) => ({
        agent_id: agent.agent_id,
        name: agent.name || '',
        url: agent.url || '',
        agentic_memory_provider_id: agent.agentic_memory?.id || '',
        identity_type: agent.identity?.type || '',
        identity_identifiers: agent.identity?.identifiers ? JSON.stringify(agent.identity.identifiers, null, 2) : ''
      })),
      config: Object.keys(cleanConfig).length > 0 ? JSON.stringify(cleanConfig, null, 2) : ''
    };
  };

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (mas) {
      form.reset(buildFormValues(mas));
    }
  }, [mas, form]);

  useEffect(() => {
    if (!isWorkspaceLoading && (!workspaceId || !masId)) {
      router.replace('/not-found');
    }
  }, [workspaceId, masId, router, isWorkspaceLoading]);

  const crumbs = mas
    ? [
        {link: routes.mas.list, text: 'Multi-Agentic Systems'},
        {link: '', text: mas.name, active: true}
      ]
    : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await masApi.delete(workspaceId!, data.id);
        toast.success(`Multi-Agentic System "${data.name}" deleted successfully`);
        await globalMutate(swrKeys.mas(workspaceId!));
        router.push(routes.mas.list);
      } catch (err) {
        setDeleteError(parseError(err));
        throw err;
      }
    });
  };

  const handleSave = async (values: FormValues) => {
    try {
      const parseJsonField = (value?: string): Record<string, unknown> | undefined =>
        !value || value.trim() === '' ? undefined : (JSON.parse(value) as Record<string, unknown>);

      const agentsPayload = (values.agents || [])
        .filter((agent) => agent.name?.trim())
        .map((agent) => ({
          ...(agent.agent_id && {agent_id: agent.agent_id}),
          name: agent.name!.trim(),
          ...(agent.url?.trim() && {url: agent.url.trim()}),
          ...(agent.agentic_memory_provider_id && {agentic_memory_provider_id: agent.agentic_memory_provider_id}),
          ...(agent.identity_type?.trim() && {
            identity: {
              type: agent.identity_type.trim(),
              identifiers: agent.identity_identifiers?.trim() ? JSON.parse(agent.identity_identifiers) : {}
            }
          })
        }));

      const configPayload = parseJsonField(values.config) || {};
      const payload: MultiAgenticSystemUpdate = {
        name: values.name,
        description: values.description,
        ...(values.shared_memory_provider_id && {shared_memory_provider_id: values.shared_memory_provider_id}),
        agents: agentsPayload,
        ...(Object.keys(configPayload).length > 0 && {config: configPayload})
      };

      await masApi.update(workspaceId as string, masId as string, payload);
      toast.success('Multi-Agentic System updated successfully');
      await mutate();
      await globalMutate(swrKeys.mas(workspaceId!));
      setIsEditMode(false);
      router.replace(routes.mas.details(masId!));
    } catch (err) {
      toast.error(parseError(err));
      throw err;
    }
  };

  const handleAssociateCEs = async () => {
    if (!workspaceId || !masId || selectedCEIds.length === 0) {
      return;
    }
    setIsAssociating(true);
    try {
      await Promise.all(selectedCEIds.map((ceId) => masApi.associateCE(workspaceId, masId, ceId)));
      toast.success(`${selectedCEIds.length} Cognition Engine${selectedCEIds.length !== 1 ? 's' : ''} associated successfully`);
      setSelectedCEIds([]);
      setAssociateModalOpen(false);
      await mutate();
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setIsAssociating(false);
    }
  };

  const handleDisassociateCE = async (ceId: string, ceName: string) => {
    if (!workspaceId || !masId) {
      return;
    }
    setDisassociatingId(ceId);
    try {
      await masApi.disassociateCE(workspaceId, masId, ceId);
      toast.success(`"${ceName}" disassociated successfully`);
      await mutate();
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setDisassociatingId(null);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    form.reset(buildFormValues(mas));
    router.replace(routes.mas.details(masId!));
  };

  const agents = mas?.agents || [];
  const activeAgents = agents.filter((a) => a.url).length;
  const totalAgents = agents.length;
  const ces = mas?.cognition_engines || [];
  const enabledCEs = ces.filter((c) => c.enabled).length;

  const fieldClass = 'flex flex-col gap-1';
  const labelClass = 'text-[10px] font-mono tracking-widest uppercase text-slate-400';
  const valueClass = 'text-sm text-slate-700';

  return (
    <>
      <BasePage
        title={mas?.name || 'MAS Details'}
        description="View details about your multi-agentic system"
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          mas && (
            <div className="flex items-center gap-2">
              <Button variant="sidebar" size="sm" onClick={() => router.push(routes.mas.metrics(masId!))} className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Metrics
              </Button>
              <Button variant="sidebar" size="sm" onClick={() => router.push(routes.mas.knowledgeGraph(masId!))} className="gap-2">
                <Network className="w-4 h-4" />
                Knowledge Graph
              </Button>
              <MASAuditLog masId={masId!} workspaceId={workspaceId!} masName={mas.name} agents={mas.agents || undefined} />
              <DetailsPageActions
                onDelete={() => deleteDialog.open({id: mas.id, name: mas.name})}
                onEdit={() => setIsEditMode(true)}
                isEditMode={isEditMode}
                onSave={form.handleSubmit(handleSave)}
                onCancelEdit={handleCancelEdit}
                isSaving={form.formState.isSubmitting}
              />
            </div>
          )
        }
      >
        <ConditionalSWRRenderer
          data={mas}
          error={error}
          itemName="MAS details"
          customIsLoading={isLoading}
          errorListStateProps={{title: 'Failed to load MAS details'}}
          emptyListStateProps={{title: 'No MAS details found'}}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
                    <Bot size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                    <span className="text-sm font-medium text-slate-700">Agents</span>
                  </div>
                  <div className="px-4 py-4">
                    <div className="text-2xl font-semibold text-slate-800">{totalAgents}</div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-slate-500">{activeAgents} active</span>
                      {totalAgents - activeAgents > 0 && <span className="text-xs text-slate-500">{totalAgents - activeAgents} degraded</span>}
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
                    <HardDrive size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                    <span className="text-sm font-medium text-slate-700">Memory Provider</span>
                  </div>
                  <div className="px-4 py-4">
                    <div className="text-sm font-medium text-slate-800 truncate">{mas?.shared_memory?.name || 'None'}</div>
                    {mas?.shared_memory?.id && <div className="font-mono text-[10px] text-slate-400 truncate mt-1">{mas.shared_memory.id}</div>}
                  </div>
                </div>

                {/* Cognition Engines stat */}
                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
                    <BrainCircuit size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                    <span className="text-sm font-medium text-slate-700">Cognition Engines</span>
                  </div>
                  <div className="px-4 py-4">
                    <div className="text-2xl font-semibold text-slate-800">{ces.length}</div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-slate-500">{enabledCEs} enabled</span>
                      {ces.length - enabledCEs > 0 && <span className="text-xs text-slate-500">{ces.length - enabledCEs} disabled</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0 space-y-4">
                  <AgentsList
                    agents={agentFields}
                    control={form.control}
                    watch={form.watch}
                    isEditMode={isEditMode}
                    agentExpandedState={agentExpandedState}
                    onToggleExpand={(id) => setAgentExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
                    onAddAgent={
                      isEditMode
                        ? () =>
                            appendAgent({
                              agent_id: '',
                              name: '',
                              url: '',
                              agentic_memory_provider_id: '',
                              identity_type: '',
                              identity_identifiers: ''
                            })
                        : undefined
                    }
                    onRemoveAgent={isEditMode ? removeAgent : undefined}
                    masAgentsData={!isEditMode && mas?.agents ? mas.agents : undefined}
                    userMemoryProviders={userMemoryProviders}
                  />

                  <div className="bg-white border border-slate-200 rounded overflow-hidden">
                    <div
                      className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 cursor-pointer"
                      onClick={() => setMasConfigExpanded(!masConfigExpanded)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">Config</span>
                        {isEditMode &&
                          (() => {
                            const cv = form.watch('config') ?? '';
                            return cv.trim() !== '' ? (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${validateJSON(cv) ? 'text-green-600 bg-green-50 border border-green-200' : 'text-red-600 bg-red-50 border border-red-200'}`}
                              >
                                {validateJSON(cv) ? 'Valid JSON' : 'Invalid JSON'}
                              </span>
                            ) : null;
                          })()}
                      </div>
                      {masConfigExpanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                    </div>
                    {masConfigExpanded && (
                      <div className="p-4">
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="config"
                            render={({field}) => (
                              <FormItem>
                                <FormControl>
                                  <Textarea
                                    placeholder={`{\n  "key": "value"\n}`}
                                    className="font-mono text-sm min-h-[150px] resize-y"
                                    {...field}
                                    onBlur={() => field.onChange(formatJson(field.value || ''))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <pre className="font-mono text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">
                            {mas?.config && Object.keys(mas.config).length > 0 ? JSON.stringify(mas.config, null, 2) : '{\n  "key": "value"\n}'}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                      <div className="flex items-center gap-2">
                        <BrainCircuit size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                        <span className="text-sm font-medium text-slate-700">Associated Cognition Engines</span>
                        {ces.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--sidebar-icon-active)/0.08)] text-[hsl(var(--sidebar-icon-active))] border border-[hsl(var(--sidebar-icon-active)/0.25)] text-[10px] font-mono">
                            {ces.length}
                          </span>
                        )}
                      </div>
                      {availableCEs.length > 0 && (
                        <Button type="button" variant="sidebar" size="sm" onClick={() => setAssociateModalOpen(true)}>
                          + Associate
                        </Button>
                      )}
                    </div>

                    {ces.length > 0 ? (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="font-mono text-[10px] tracking-widest uppercase text-slate-400 text-left px-4 py-2.5 font-medium">
                              Engine
                            </th>
                            <th className="font-mono text-[10px] tracking-widest uppercase text-slate-400 text-left px-4 py-2.5 font-medium">Type</th>
                            <th className="font-mono text-[10px] tracking-widest uppercase text-slate-400 text-left px-4 py-2.5 font-medium">
                              Version
                            </th>
                            <th className="font-mono text-[10px] tracking-widest uppercase text-slate-400 text-left px-4 py-2.5 font-medium">
                              Enabled
                            </th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {ces.map((ce) => (
                            <tr key={ce.ce_id} className="hover:bg-slate-50 transition-colors group bg-white">
                              <td className="px-4 py-3 text-slate-800 font-medium text-sm">{ce.name}</td>
                              <td className="px-4 py-3 font-mono text-sm text-slate-500">{ce.kind || '—'}</td>
                              <td className="px-4 py-3 font-mono text-sm text-slate-500">{ce.subkind || '—'}</td>
                              <td className="px-4 py-3">
                                <Badge variant={ce.enabled ? 'info' : 'inactive'}>{ce.enabled ? 'Enabled' : 'Disabled'}</Badge>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  disabled={disassociatingId === ce.ce_id}
                                  onClick={() => handleDisassociateCE(ce.ce_id, ce.name)}
                                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                >
                                  <Unlink className="w-3 h-3" />
                                  {disassociatingId === ce.ce_id ? 'Removing...' : 'Disassociate'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-4 py-4 text-sm text-muted-foreground">No Cognition Engines associated yet.</p>
                    )}
                  </div>
                </div>

                <div className="w-[26rem] shrink-0 space-y-4">
                  <div className="bg-white border border-slate-200 rounded overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                      <span className="text-sm font-medium text-slate-700">System Details</span>
                    </div>
                    <div className="px-4 py-4 space-y-3">
                      <div className={fieldClass}>
                        <span className={labelClass}>Name</span>
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="name"
                            render={({field}) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input {...field} className="h-7 text-xs" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <span className={valueClass}>{mas?.name || '—'}</span>
                        )}
                      </div>

                      <div className={`${fieldClass} min-w-0`}>
                        <span className={labelClass}>ID</span>
                        <CopyableInput value={mas?.id || ''} />
                      </div>

                      <div className={`${fieldClass} min-w-0`}>
                        <span className={labelClass}>Workspace ID</span>
                        <CopyableInput value={mas?.workspace_id || ''} />
                      </div>

                      <div className={fieldClass}>
                        <span className={labelClass}>Created</span>
                        <span className={valueClass}>
                          {mas?.created_at ? new Date(mas.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : '—'}
                        </span>
                      </div>

                      <div className={fieldClass}>
                        <span className={labelClass}>Last Modified</span>
                        <span className={valueClass}>
                          {mas?.updated_at ? new Date(mas.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : '—'}
                        </span>
                      </div>

                      <div className={fieldClass}>
                        <span className={labelClass}>Description</span>
                        {isEditMode ? (
                          <FormField
                            control={form.control}
                            name="description"
                            render={({field}) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <Input {...field} className="h-7 text-xs" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <span className={valueClass}>{mas?.description || '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Shared Memory Provider */}
                  <div className="bg-white border border-slate-200 rounded overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                      <span className="text-sm font-medium text-slate-700">Shared Memory Provider</span>
                    </div>
                    <div className="px-4 py-4">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="shared_memory_provider_id"
                          render={({field}) => (
                            <FormItem className="space-y-1">
                              <span className={labelClass}>Provider</span>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Select provider" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {sharedMemoryProviders.length === 0 ? (
                                    <div className="py-2 px-2 text-sm text-muted-foreground">No providers available</div>
                                  ) : (
                                    sharedMemoryProviders.map((provider) => (
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
                      ) : mas?.shared_memory?.id ? (
                        <div className="space-y-3">
                          <div className={fieldClass}>
                            <span className={labelClass}>Name</span>
                            <span className={valueClass}>{mas.shared_memory.name || '—'}</span>
                          </div>
                          <div className={`${fieldClass} min-w-0`}>
                            <span className={labelClass}>Provider ID</span>
                            <CopyableInput value={mas.shared_memory.id} />
                          </div>
                          {mas.shared_memory.description && (
                            <div className={fieldClass}>
                              <span className={labelClass}>Description</span>
                              <span className={valueClass}>{mas.shared_memory.description}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className={valueClass}>None configured</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </ConditionalSWRRenderer>
      </BasePage>

      <MASAssociateCEModal
        open={associateModalOpen}
        onOpenChange={setAssociateModalOpen}
        availableCEs={availableCEs}
        selectedCEIds={selectedCEIds}
        setSelectedCEIds={setSelectedCEIds}
        isAssociating={isAssociating}
        onAssociate={handleAssociateCEs}
      />

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
