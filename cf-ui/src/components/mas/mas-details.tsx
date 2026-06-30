// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

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
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import {Badge} from '@/components/ui/badge';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {toast} from 'sonner';
import {Network, BarChart3, Bot, BrainCircuit, Unlink, Plus, MoreHorizontal} from 'lucide-react';
import {ActionButton} from '@/components/ui/action-button';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {MASAuditLog} from './mas-audit-log';
import {MASAssociateCEModal} from './mas-associate-ce-modal';
import {AgentsList} from './agents-list';
import {UpdateMASFormSchema, type FormValues} from './mas-form-schema';
import {dtSectionHeader, dtPanelHeader} from '@/lib/detail-typography';
import {DetailTabs} from '@/components/ui/detail-tabs';
import {StatusDot} from '@/components/ui/status-dot';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import {MetaCard} from '@/components/ui/meta-card';
import {CollapsibleJsonField} from './collapsible-json-field';
import {IdHoverCard} from '@/components/ui/id-hover-card';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'cognition-engines'>('overview');

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

  const ces = mas?.cognition_engines || [];
  const enabledCEs = ces.filter((c) => c.enabled).length;

  return (
    <>
      <BasePage
        title={mas?.name || 'MAS Details'}
        customDescription={
          mas ? (
            <IdHoverCard
              value={mas.id}
              items={[
                {label: 'MAS ID', value: mas.id},
                {label: 'Workspace', value: mas.workspace_id}
              ]}
            />
          ) : undefined
        }
        customInfo={
          <DetailTabs
            activeTab={activeTab}
            onTabChange={(id) => {
              if (id === 'cognition-engines' && isEditMode) {
                handleCancelEdit();
              }
              setActiveTab(id as typeof activeTab);
            }}
            tabs={[
              {id: 'overview', label: 'Overview'},
              {id: 'agents', label: 'Agents', count: agentFields.length || undefined},
              {id: 'cognition-engines', label: 'Cognition Engines', count: ces.length || undefined}
            ]}
          />
        }
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          mas && (
            <div className="flex items-center gap-2">
              <ActionButton icon={BarChart3} label="Metrics" onClick={() => router.push(routes.mas.metrics(masId!))} />
              <ActionButton icon={Network} label="Knowledge Graph" onClick={() => router.push(routes.mas.knowledgeGraph(masId!))} />
              <MASAuditLog masId={masId!} workspaceId={workspaceId!} masName={mas.name} agents={mas.agents || undefined} />
              {activeTab !== 'cognition-engines' && (
                <>
                  <div className="w-px h-5 bg-border mx-1 shrink-0" />
                  <DetailsPageActions
                    onDelete={() => deleteDialog.open({id: mas.id, name: mas.name})}
                    onEdit={() => setIsEditMode(true)}
                    isEditMode={isEditMode}
                    onSave={form.handleSubmit(handleSave)}
                    onCancelEdit={handleCancelEdit}
                    isSaving={form.formState.isSubmitting}
                  />
                </>
              )}
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
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <InfoPanel>
                    <InfoRow label="Name">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="name"
                          render={({field}) => (
                            <FormItem className="flex-1 space-y-1">
                              <FormControl>
                                <Input {...field} className="h-8 text-sm" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <span className="text-sm text-foreground">{mas?.name || '—'}</span>
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
                                <Input {...field} className="h-8 text-sm" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <span className="text-sm text-foreground">{mas?.description || '—'}</span>
                      )}
                    </InfoRow>
                    <InfoRow label="Shared Memory">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="shared_memory_provider_id"
                          render={({field}) => (
                            <FormItem className="flex-1 space-y-1">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-8 text-sm">
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
                      ) : (
                        <span className="text-sm text-foreground">{mas?.shared_memory?.name || '—'}</span>
                      )}
                    </InfoRow>
                  </InfoPanel>

                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="config"
                      render={({field}) => (
                        <CollapsibleJsonField
                          label="Config"
                          value={field.value ?? ''}
                          isEditMode={true}
                          field={field}
                          placeholder={`{\n  "key": "value"\n}`}
                        />
                      )}
                    />
                  ) : (
                    <CollapsibleJsonField
                      label="Config"
                      value={mas?.config && Object.keys(mas.config).length > 0 ? JSON.stringify(mas.config, null, 2) : ''}
                      isEditMode={false}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {mas?.created_at && (
                      <MetaCard label="Created" mono>
                        {new Date(mas.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                    {mas?.updated_at && (
                      <MetaCard label="Last Modified" mono>
                        {new Date(mas.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'agents' && (
                <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                  <div className={dtPanelHeader}>
                    <div className="flex items-center gap-2">
                      <Bot size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                      <span className={dtSectionHeader}>Agents</span>
                      {agentFields.length > 0 && (
                        <Badge variant="accent" className="rounded px-1.5">
                          {agentFields.length}
                        </Badge>
                      )}
                    </div>
                    {isEditMode && (
                      <Button
                        type="button"
                        variant="sidebar"
                        size="sm"
                        className="gap-2"
                        onClick={() =>
                          appendAgent({agent_id: '', name: '', url: '', agentic_memory_provider_id: '', identity_type: '', identity_identifiers: ''})
                        }
                      >
                        <Plus className="w-4 h-4" />
                        Add Agent
                      </Button>
                    )}
                  </div>
                  <div className="p-4">
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
                  </div>
                </div>
              )}

              {activeTab === 'cognition-engines' && (
                <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                  <div className={dtPanelHeader}>
                    <div className="flex items-center gap-2">
                      <BrainCircuit size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                      <span className={dtSectionHeader}>Associated Cognition Engines</span>
                      {ces.length > 0 && (
                        <Badge variant="accent" className="rounded px-1.5">
                          {ces.length}
                        </Badge>
                      )}
                      {ces.length > 0 && ces.length - enabledCEs > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {enabledCEs} enabled, {ces.length - enabledCEs} disabled
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
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Subkind</TableHead>
                          <TableHead>Enabled</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ces.map((ce) => (
                          <TableRow key={ce.ce_id}>
                            <TableCell className="font-medium">{ce.name}</TableCell>
                            <TableCell>
                              {ce.kind ? (
                                <span className="inline-flex items-center font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded text-foreground">
                                  {ce.kind}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {ce.subkind ? (
                                <span className="inline-flex items-center font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded text-foreground">
                                  {ce.subkind}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusDot variant="state" active={ce.enabled} />
                            </TableCell>
                            <TableCell className="w-10">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    disabled={disassociatingId === ce.ce_id}
                                  >
                                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950 gap-2"
                                    onClick={() => handleDisassociateCE(ce.ce_id, ce.name)}
                                    disabled={disassociatingId === ce.ce_id}
                                  >
                                    <Unlink className="w-4 h-4" />
                                    {disassociatingId === ce.ce_id ? 'Removing...' : 'Disassociate'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="px-4 py-4 text-sm text-muted-foreground">No Cognition Engines associated yet.</p>
                  )}
                </div>
              )}
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
