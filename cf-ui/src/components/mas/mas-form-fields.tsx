'use client';

import type {Dispatch, SetStateAction} from 'react';
import type {UseFormReturn, FieldArrayWithId, UseFieldArrayAppend, UseFieldArrayRemove} from 'react-hook-form';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {CopyableInput} from '@/components/ui/copyable-input';
import {ReadOnlyField} from '@/components/ui/read-only-field';
import {CollapsibleJsonField} from './collapsible-json-field';
import {AgentsList} from './agents-list';
import {ChevronDown, ChevronUp, Plus, Unlink} from 'lucide-react';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';
import type {FormValues} from './mas-form-schema';

interface MASFormFieldsProps {
  mas: MultiAgenticSystem | undefined;
  form: UseFormReturn<FormValues>;
  isEditMode: boolean;
  masConfigExpanded: boolean;
  setMasConfigExpanded: (v: boolean) => void;
  agentFields: FieldArrayWithId<FormValues, 'agents'>[];
  appendAgent: UseFieldArrayAppend<FormValues, 'agents'>;
  removeAgent: UseFieldArrayRemove;
  agentExpandedState: Record<string, boolean>;
  setAgentExpandedState: Dispatch<SetStateAction<Record<string, boolean>>>;
  sharedMemoryProviders: {id: string; provider_name: string}[];
  userMemoryProviders: {id: string; provider_name: string}[];
  cesSectionExpanded: boolean;
  setCesSectionExpanded: Dispatch<SetStateAction<boolean>>;
  expandedCEs: Record<string, boolean>;
  setExpandedCEs: Dispatch<SetStateAction<Record<string, boolean>>>;
  availableCEs: CognitionEngineListItem[];
  disassociatingId: string | null;
  onDisassociateCE: (ceId: string, ceName: string) => void;
  onOpenAssociateModal: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
}

export function MASFormFields({
  mas,
  form,
  isEditMode,
  masConfigExpanded,
  setMasConfigExpanded,
  agentFields,
  appendAgent,
  removeAgent,
  agentExpandedState,
  setAgentExpandedState,
  sharedMemoryProviders,
  userMemoryProviders,
  cesSectionExpanded,
  setCesSectionExpanded,
  expandedCEs,
  setExpandedCEs,
  availableCEs,
  disassociatingId,
  onDisassociateCE,
  onOpenAssociateModal,
  onSubmit
}: MASFormFieldsProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
              <ReadOnlyField value={mas?.name || ''} />
            </div>
          )}

          <div className="space-y-2">
            <Label>ID</Label>
            <CopyableInput value={mas?.id || ''} />
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
              <ReadOnlyField value={mas?.description || ''} />
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
                        {sharedMemoryProviders.length === 0 ? (
                          <div className="py-2 px-2 text-sm text-muted-foreground">No shared memory providers available</div>
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
              <div className="space-y-2">
                <ReadOnlyField value={mas?.shared_memory?.name || 'None'} />
                <div>
                  <Label className="text-xs text-muted-foreground">Provider ID</Label>
                  <CopyableInput value={mas.shared_memory.id} />
                </div>
              </div>
            ) : (
              <ReadOnlyField value="None" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Agents</Label>
          {isEditMode && agentFields.length > 0 && (
            <Button
              type="button"
              variant="sidebar"
              size="sm"
              className="gap-2"
              onClick={() => appendAgent({agent_id: '', name: '', url: '', agentic_memory_provider_id: '', identity_type: '', identity_identifiers: ''})}
            >
              <Plus className="w-4 h-4" />
              Add Agent
            </Button>
          )}
        </div>

        <AgentsList
          agents={agentFields}
          control={form.control}
          watch={form.watch}
          isEditMode={isEditMode}
          agentExpandedState={agentExpandedState}
          onToggleExpand={(id) => setAgentExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
          onAddAgent={
            isEditMode
              ? () => appendAgent({agent_id: '', name: '', url: '', agentic_memory_provider_id: '', identity_type: '', identity_identifiers: ''})
              : undefined
          }
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
                placeholder={`{\n  "key": "value"\n}`}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
          <div className="space-y-2">
            <Label>Workspace ID</Label>
            <CopyableInput value={mas?.workspace_id || ''} />
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setCesSectionExpanded((prev) => !prev)}>
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium cursor-pointer">
                  {mas?.cognition_engines && mas.cognition_engines.length > 0
                    ? `${mas.cognition_engines.length} Associated Cognition Engine${mas.cognition_engines.length !== 1 ? 's' : ''}`
                    : 'Associated Cognition Engines'}
                </Label>
                {cesSectionExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              {availableCEs.length > 0 && (
                <Button
                  type="button"
                  variant="sidebar"
                  size="sm"
                  className="gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAssociateModal();
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Associate CE
                </Button>
              )}
            </div>

            {cesSectionExpanded && (
              <>
                {mas?.cognition_engines && mas.cognition_engines.length > 0 ? (
                  <div className="space-y-2">
                    {mas.cognition_engines.map((ce) => {
                      const isExpanded = expandedCEs[ce.ce_id] ?? false;
                      return (
                        <div key={ce.ce_id} className="rounded-lg border border-border bg-card p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div
                              className="flex items-center gap-2 flex-1 cursor-pointer"
                              onClick={() => setExpandedCEs((prev) => ({...prev, [ce.ce_id]: !prev[ce.ce_id]}))}
                            >
                              <span className="text-sm font-medium">{ce.name}</span>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <Badge variant={ce.status === 'online' ? 'success' : 'inactive'}>{ce.status === 'online' ? 'Online' : 'Offline'}</Badge>
                              <Badge variant={ce.enabled ? 'info' : 'inactive'}>{ce.enabled ? 'Enabled' : 'Disabled'}</Badge>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1 h-7 text-xs"
                                disabled={disassociatingId === ce.ce_id}
                                onClick={() => onDisassociateCE(ce.ce_id, ce.name)}
                              >
                                <Unlink className="w-3 h-3" />
                                {disassociatingId === ce.ce_id ? 'Removing...' : 'Disassociate'}
                              </Button>
                              <button
                                type="button"
                                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted border border-border"
                                onClick={() => setExpandedCEs((prev) => ({...prev, [ce.ce_id]: !prev[ce.ce_id]}))}
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="pt-3 border-t space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">CE ID</Label>
                                  <CopyableInput value={ce.ce_id} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">URL</Label>
                                  <ReadOnlyField value={ce.url || '—'} className="font-mono text-xs" />
                                </div>
                                {ce.kind && (
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Kind</Label>
                                    <ReadOnlyField value={ce.kind} />
                                  </div>
                                )}
                                {ce.subkind && (
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Subkind</Label>
                                    <ReadOnlyField value={ce.subkind} />
                                  </div>
                                )}
                              </div>
                              {ce.mas_config && Object.keys(ce.mas_config).length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">MAS Config</Label>
                                  <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all text-foreground">
                                    {JSON.stringify(ce.mas_config, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No Cognition Engines associated yet.</p>
                )}
              </>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
