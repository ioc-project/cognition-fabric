// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useFieldArray} from 'react-hook-form';
import {swrKeys} from '@/lib/swr-config';
import {masApi} from '@/api/endpoints';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';
import {Button} from '@/components/ui/button';
import {BasePage} from '@/components/ui/base-page';
import {Input} from '@/components/ui/input';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import {Badge} from '@/components/ui/badge';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError, formatTimestamp} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {toast} from 'sonner';
import {Bot, BrainCircuit, Unlink, Plus, Settings2, MoreHorizontal, Server} from 'lucide-react';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {MASAuditLog} from './mas-audit-log';
import {MASAssociateCEModal} from './mas-associate-ce-modal';
import {AgentsList} from './agents-list';
import {MCPServersList} from './mcp-servers-list';
import {useMASRequestDraft} from '@/hooks/useMASRequestDraft';
import {supportedRequest} from './mas-request-draft';
import {MASInputMode, MASJsonEditor, MASRequestError, TopologyJSON} from './mas-json-editor';
import {dtSectionHeader, dtPanelHeader} from '@/lib/detail-typography';
import {DetailTabs} from '@/components/ui/detail-tabs';
import {StatusDot} from '@/components/ui/status-dot';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import {MetaCard} from '@/components/ui/meta-card';
import {CollapsibleJsonField} from './collapsible-json-field';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {JsonEditor} from '@/components/ui/json-editor';
import {validateJSON, formatJson} from '@/lib/utils';
import {IdHoverCard} from '@/components/ui/id-hover-card';
import {MASTopology} from './mas-topology';

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
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [writeFailed, setWriteFailed] = useState(false);

  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'mcp-servers' | 'cognition-engines' | 'topology'>('overview');

  const [associateModalOpen, setAssociateModalOpen] = useState(false);
  const [selectedCEIds, setSelectedCEIds] = useState<string[]>([]);
  const [isAssociating, setIsAssociating] = useState(false);
  const [disassociatingId, setDisassociatingId] = useState<string | null>(null);
  const [agentExpandedState, setAgentExpandedState] = useState<Record<string, boolean>>({});
  const [mcpServerExpandedState, setMcpServerExpandedState] = useState<Record<string, boolean>>({});
  const [editConfigCE, setEditConfigCE] = useState<{ce_id: string; name: string; mas_config: Record<string, unknown> | null} | null>(null);
  const [editConfigValue, setEditConfigValue] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const {
    data: mas,
    error,
    isLoading,
    mutate
  } = useSWR<MultiAgenticSystem>(
    workspaceId && masId ? swrKeys.masDetails(workspaceId, masId) : null,
    () => masApi.get(workspaceId as string, masId as string),
    {dedupingInterval: 2000}
  );
  const {cognitionEngines = []} = useCognitionEngines();

  const associatedCeIds = new Set(mas?.cognition_engines?.map((ce) => ce.ce_id) ?? []);
  const availableCEs = cognitionEngines.filter((ce) => !associatedCeIds.has(ce.id));

  const draft = useMASRequestDraft(workspaceId || '');
  const {form, reset: resetDraft, seededId} = draft;

  const {fields: agentFields, append: appendAgent, remove: removeAgent} = useFieldArray({control: form.control, name: 'agents'});
  const {fields: mcpServerFields, append: appendMcpServer, remove: removeMcpServer} = useFieldArray({control: form.control, name: 'mcp_servers'});

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (mas && (!isEditMode || seededId.current !== mas.id)) {
      resetDraft(mas);
    }
  }, [mas, isEditMode, resetDraft, seededId]);

  useEffect(() => {
    if (!isWorkspaceLoading && (!workspaceId || !masId)) {
      router.replace('/not-found');
    }
  }, [workspaceId, masId, router, isWorkspaceLoading]);

  useEffect(() => {
    void mutate();
  }, [activeTab, mutate]);

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

  const handleSave = async () => {
    if (isSaving) {
      return;
    }
    setSaveError(null);
    setWriteFailed(false);
    draft.clearErrors();
    let request;
    let payload;
    try {
      request = draft.read();
      payload = supportedRequest(request, 'update');
    } catch (cause) {
      draft.reportError(cause);
      return;
    }
    setIsSaving(true);
    try {
      const updated = await masApi.update(workspaceId as string, masId as string, payload);
      draft.clearLegacyRecovery(masId!);
      toast.success('Multi-Agentic System updated successfully');
      await mutate(updated, {revalidate: false});
      await globalMutate(swrKeys.mas(workspaceId!));
      resetDraft(updated);
      setIsEditMode(false);
      router.replace(routes.mas.details(masId!));
    } catch (err) {
      const message = parseError(err);
      setSaveError(message);
      setWriteFailed(true);
      draft.reportError(err);
      toast.error(message);
    } finally {
      setIsSaving(false);
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

  const handleSaveCEConfig = async () => {
    if (!workspaceId || !masId || !editConfigCE) {
      return;
    }
    setIsSavingConfig(true);
    try {
      const parsed = editConfigValue.trim() === '' ? {} : JSON.parse(editConfigValue);
      await masApi.patchCEMasConfig(workspaceId, masId, editConfigCE.ce_id, parsed);
      toast.success(`Config updated for CE ${editConfigCE.name}`);
      await mutate();
      setEditConfigCE(null);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    resetDraft(mas);
    setSaveError(null);
    setWriteFailed(false);
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
              truncate={false}
              items={[
                {label: 'MAS ID', value: mas.id},
                {label: 'Workspace', value: mas.workspace_id}
              ]}
            />
          ) : undefined
        }
        customInfo={
          !(isEditMode && draft.mode === 'json') && (
            <DetailTabs
              activeTab={activeTab}
              onTabChange={(id) => {
                setActiveTab(id as typeof activeTab);
              }}
              tabs={[
                {id: 'overview', label: 'Overview'},
                {id: 'agents', label: 'Agents', count: agentFields.length || undefined},
                {id: 'mcp-servers', label: 'MCP Servers', count: mcpServerFields.length || undefined},
                {id: 'cognition-engines', label: 'Cognition Engines', count: ces.length || undefined},
                {id: 'topology', label: 'Topology'}
              ]}
            />
          )
        }
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          mas && (
            <div className="flex items-center gap-0.5">
              <MASAuditLog masId={masId!} workspaceId={workspaceId!} masName={mas.name} agents={mas.agents || undefined} />
              {(activeTab !== 'cognition-engines' || isEditMode) && (
                <>
                  <div className="w-px h-5 bg-border mx-1 shrink-0" />
                  {isEditMode && <MASInputMode mode={draft.mode} onChange={(mode) => draft.switchMode(mode, mas)} disabled={isSaving} />}
                  <DetailsPageActions
                    onDelete={() => deleteDialog.open({id: mas.id, name: mas.name})}
                    onEdit={() => {
                      resetDraft(mas);
                      setSaveError(null);
                      setWriteFailed(false);
                      setIsEditMode(true);
                    }}
                    isEditMode={isEditMode}
                    onSave={() => void handleSave()}
                    onCancelEdit={handleCancelEdit}
                    isSaving={isSaving}
                  />
                </>
              )}
            </div>
          )
        }
      >
        {isEditMode && <MASRequestError message={draft.error || saveError} inspectHref={routes.mas.details(masId!)} writeFailed={writeFailed} />}
        {error && mas && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card p-3 text-sm">
            <p>Could not refresh MAS details. Showing the last loaded data; unsaved edits are preserved.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
              Retry
            </Button>
          </div>
        )}
        <ConditionalSWRRenderer
          data={mas}
          error={mas ? undefined : error}
          itemName="MAS details"
          customIsLoading={isLoading && !mas}
          errorListStateProps={{title: 'Failed to load MAS details'}}
          emptyListStateProps={{title: 'No MAS details found'}}
        >
          <Form {...form}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
              className="space-y-4"
            >
              <fieldset disabled={isSaving} className="contents">
                {isEditMode && draft.mode === 'json' ? (
                  <MASJsonEditor value={draft.json} onChange={draft.setJson} disabled={isSaving} />
                ) : (
                  <>
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
                              <span className="text-sm text-foreground">{mas?.name || '-'}</span>
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
                              <span className="text-sm text-foreground">{mas?.description || '-'}</span>
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
                                disabled={isSaving}
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
                              {formatTimestamp(mas.created_at)}
                            </MetaCard>
                          )}
                          {mas?.updated_at && (
                            <MetaCard label="Last Modified" mono>
                              {formatTimestamp(mas.updated_at)}
                            </MetaCard>
                          )}
                        </div>
                      </div>
                    )}

                    {activeTab === 'agents' && (
                      <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                        <div className={dtPanelHeader}>
                          <div className="flex items-center gap-0.5">
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
                                appendAgent({agent_id: '', name: '', description: '', url: '', identity_type: '', identity_identifiers: ''})
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
                            disabled={isSaving}
                            agentExpandedState={agentExpandedState}
                            onToggleExpand={(id) => setAgentExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
                            onAddAgent={
                              isEditMode
                                ? () =>
                                    appendAgent({
                                      agent_id: '',
                                      name: '',
                                      description: '',
                                      url: '',
                                      identity_type: '',
                                      identity_identifiers: ''
                                    })
                                : undefined
                            }
                            onRemoveAgent={isEditMode ? removeAgent : undefined}
                            masAgentsData={mas?.agents || undefined}
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === 'mcp-servers' && (
                      <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                        <div className={dtPanelHeader}>
                          <div className="flex items-center gap-0.5">
                            <Server size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                            <span className={dtSectionHeader}>MCP Servers</span>
                            {mcpServerFields.length > 0 && (
                              <Badge variant="accent" className="rounded px-1.5">
                                {mcpServerFields.length}
                              </Badge>
                            )}
                          </div>
                          {isEditMode && (
                            <Button
                              type="button"
                              variant="sidebar"
                              size="sm"
                              className="gap-2"
                              onClick={() => appendMcpServer({name: '', description: '', transport: '', tools: []})}
                            >
                              <Plus className="w-4 h-4" />
                              Add MCP Server
                            </Button>
                          )}
                        </div>
                        <div className="p-4">
                          <MCPServersList
                            servers={mcpServerFields}
                            control={form.control}
                            watch={form.watch}
                            isEditMode={isEditMode}
                            disabled={isSaving}
                            serverExpandedState={mcpServerExpandedState}
                            onToggleExpand={(id) => setMcpServerExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
                            onAddServer={isEditMode ? () => appendMcpServer({name: '', description: '', transport: '', tools: []}) : undefined}
                            onRemoveServer={isEditMode ? removeMcpServer : undefined}
                            masServersData={!isEditMode && mas?.mcp_servers ? mas.mcp_servers : undefined}
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === 'topology' &&
                      (isEditMode ? (
                        <TopologyJSON value={draft.topologyJSON} onChange={draft.changeTopology} disabled={isSaving} error={draft.topologyError} />
                      ) : (
                        mas && <MASTopology key={`${workspaceId}:${mas.id}`} mas={mas} />
                      ))}

                    {activeTab === 'cognition-engines' && (
                      <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                        <div className={dtPanelHeader}>
                          <div className="flex items-center gap-0.5">
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
                                <TableHead>Version</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Enabled</TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ces.map((ce) => (
                                <TableRow key={ce.ce_id} className="group">
                                  <TableCell className="font-medium align-top py-3 font-mono">{ce.name}</TableCell>
                                  <TableCell className="align-top py-3 font-mono">{ce.version}</TableCell>
                                  <TableCell>
                                    <Badge variant={ce.status === 'online' ? 'success' : 'inactive'}>
                                      {ce.status === 'online' ? 'Online' : 'Offline'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <StatusDot variant="state" active={ce.enabled} />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="gap-1.5 h-7 text-xs"
                                          onClick={() => {
                                            setEditConfigCE({ce_id: ce.ce_id, name: ce.name, mas_config: ce.mas_config ?? null});
                                            setEditConfigValue(
                                              ce.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''
                                            );
                                          }}
                                        >
                                          <Settings2 className="w-3 h-3" />
                                          Edit Config
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="gap-1.5 h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950"
                                          disabled={disassociatingId === ce.ce_id}
                                          onClick={() => handleDisassociateCE(ce.ce_id, ce.name)}
                                        >
                                          <Unlink className="w-3 h-3" />
                                          {disassociatingId === ce.ce_id ? 'Removing...' : 'Disassociate'}
                                        </Button>
                                      </div>
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
                                            className="gap-2"
                                            onClick={() => {
                                              setEditConfigCE({ce_id: ce.ce_id, name: ce.name, mas_config: ce.mas_config ?? null});
                                              setEditConfigValue(
                                                ce.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''
                                              );
                                            }}
                                          >
                                            <Settings2 className="w-4 h-4" />
                                            Edit Config
                                          </DropdownMenuItem>
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
                                    </div>
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
                  </>
                )}
              </fieldset>
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

      <Dialog open={!!editConfigCE} onOpenChange={(open) => !open && setEditConfigCE(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Config for CE {editConfigCE?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-0.5">
              <Label className="text-xs text-muted-foreground">Overrides the default MAS config for this CE</Label>
              {editConfigValue.trim() && (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${validateJSON(editConfigValue) ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}
                >
                  {validateJSON(editConfigValue) ? 'Valid JSON' : 'Invalid JSON'}
                </span>
              )}
            </div>
            <JsonEditor
              id="ce-mas-config"
              label="CE MAS Config"
              value={editConfigValue}
              onChange={setEditConfigValue}
              onBlur={() => setEditConfigValue(formatJson(editConfigValue) || editConfigValue)}
              placeholder={'{\n  "key": "value"\n}'}
              disabled={isSavingConfig}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditConfigCE(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveCEConfig} disabled={isSavingConfig}>
              {isSavingConfig ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
