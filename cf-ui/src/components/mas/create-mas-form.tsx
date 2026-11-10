// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useFieldArray} from 'react-hook-form';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useMAS} from '@/hooks/useMAS';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {MultiSelect} from '@/components/ui/multi-select';
import {AgentsList} from './agents-list';
import {MCPServersList} from './mcp-servers-list';
import {CollapsibleJsonField} from './collapsible-json-field';
import {FormSectionHeader} from '@/components/ui/form-section-header';
import {useMASRequestDraft} from '@/hooks/useMASRequestDraft';
import {supportedRequest} from './mas-request-draft';
import {MASInputMode, MASJsonEditor, MASRequestError, TopologyJSON} from './mas-json-editor';

interface CreateMASFormProps {
  workspaceId: string;
  onCancel?: () => void;
}

export function CreateMASForm({workspaceId, onCancel}: CreateMASFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeFailed, setWriteFailed] = useState(false);
  const [masConfigExpanded, setMasConfigExpanded] = useState(true);
  const [agentExpandedState, setAgentExpandedState] = useState<Record<string, boolean>>({});
  const [mcpServerExpandedState, setMcpServerExpandedState] = useState<Record<string, boolean>>({});
  const {addMAS} = useMAS(workspaceId);
  const {cognitionEngines = []} = useCognitionEngines();

  const draft = useMASRequestDraft(workspaceId);
  const {form} = draft;

  const {
    fields: agentFields,
    append: appendAgent,
    remove: removeAgent
  } = useFieldArray({
    control: form.control,
    name: 'agents'
  });

  const {
    fields: mcpServerFields,
    append: appendMcpServer,
    remove: removeMcpServer
  } = useFieldArray({
    control: form.control,
    name: 'mcp_servers'
  });

  const handleSubmit = async () => {
    setError(null);
    setWriteFailed(false);
    draft.clearErrors();
    let request;
    let payload;
    try {
      request = draft.read();
      payload = supportedRequest(request, 'create');
    } catch (cause) {
      draft.reportError(cause);
      return;
    }
    try {
      setIsLoading(true);
      const response = await addMAS(payload);

      toast.success(`Multi-Agentic System "${response.name}" created successfully`);

      draft.clearLegacyRecovery(response.id);
      router.push(routes.mas.details(response.id));
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      setWriteFailed(true);
      draft.reportError(err);
      toast.error(`Failed to create Multi-Agentic System: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(routes.mas.list);
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Create Multi‑Agentic System"
        description="Create a multi‑agentic system for this workspace."
        useBreadcrumbs
        breadcrumbs={breadcrumbs.masCreate()}
        callToAction={<MASInputMode mode={draft.mode} onChange={(mode) => draft.switchMode(mode)} disabled={isLoading} />}
      >
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="flex flex-col items-start gap-6 w-full max-w-[1100px]"
          >
            <MASRequestError message={draft.error || error} inspectHref={routes.mas.list} writeFailed={writeFailed} />
            <fieldset disabled={isLoading} className="contents">
              {draft.mode === 'json' ? (
                <MASJsonEditor value={draft.json} onChange={draft.setJson} disabled={isLoading} />
              ) : (
                <>
                  <Card className="w-full">
                    <CardContent className="pt-8 px-8 pb-1">
                      <div className="flex flex-col gap-4 mb-6">
                        <FormSectionHeader title="Basic Information" description="Define the core properties of your multi-agentic system" />
                        <div className="flex flex-col gap-6">
                          <FormField
                            control={form.control}
                            name="name"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel required>Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="testing mas creation" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="description"
                            render={({field}) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                  <Textarea placeholder="Collaborative research and analysis team" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="w-full">
                    <CardContent className="pt-8 px-8 pb-1">
                      <div className="flex flex-col gap-4 mb-6">
                        <FormSectionHeader title="Cognition Engines" description="Attach cognition engines to this multi-agentic system" />
                        <FormField
                          control={form.control}
                          name="cognition_engine_ids"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel>Cognition Engines</FormLabel>
                              <FormControl>
                                <MultiSelect
                                  value={field.value ?? []}
                                  options={cognitionEngines.map((ce) => ({
                                    label: `${ce.name} v${ce.version} (${ce.ce_type})`,
                                    value: ce.id,
                                    disabled: ce.mas_auto_associate ?? false,
                                    hint: ce.mas_auto_associate ? 'Automatically attached to this MAS at creation.' : undefined
                                  }))}
                                  placeholder="Select cognition engines"
                                  emptyMessage="No cognition engines available"
                                  onChange={field.onChange}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="w-full">
                    <CardContent className="pt-8 px-8 pb-1">
                      <div className="flex flex-col gap-4 mb-6">
                        <FormSectionHeader title="Agents" description="Add and configure agents for this multi-agentic system" />
                        <AgentsList
                          agents={agentFields}
                          control={form.control}
                          watch={form.watch}
                          isEditMode={true}
                          disabled={isLoading}
                          agentExpandedState={agentExpandedState}
                          onToggleExpand={(id) => setAgentExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
                          onAddAgent={() =>
                            appendAgent({agent_id: '', name: '', description: '', url: '', identity_type: '', identity_identifiers: ''})
                          }
                          onRemoveAgent={removeAgent}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="w-full">
                    <CardContent className="pt-8 px-8 pb-1">
                      <div className="flex flex-col gap-4 mb-6">
                        <FormSectionHeader title="MCP Servers" description="Add MCP servers and their tools for this multi-agentic system" />
                        <MCPServersList
                          servers={mcpServerFields}
                          control={form.control}
                          watch={form.watch}
                          isEditMode={true}
                          disabled={isLoading}
                          serverExpandedState={mcpServerExpandedState}
                          onToggleExpand={(id) => setMcpServerExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
                          onAddServer={() => appendMcpServer({name: '', description: '', transport: '', tools: []})}
                          onRemoveServer={removeMcpServer}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <TopologyJSON value={draft.topologyJSON} onChange={draft.changeTopology} disabled={isLoading} error={draft.topologyError} />

                  <Card className="w-full">
                    <CardContent className="pt-8 px-8 pb-1">
                      <div className="flex flex-col gap-4 mb-6">
                        <FormSectionHeader title="Configuration" description="Optional JSON configuration for this multi-agentic system" />
                        <FormField
                          control={form.control}
                          name="config"
                          render={({field}) => (
                            <CollapsibleJsonField
                              label="Config"
                              value={field.value || ''}
                              isExpanded={masConfigExpanded}
                              onToggleExpand={() => setMasConfigExpanded(!masConfigExpanded)}
                              isEditMode={true}
                              disabled={isLoading}
                              field={field}
                              placeholder={`{
  "key": "value"
}`}
                            />
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              <div className="flex items-center gap-3 pt-4 border-t w-full">
                {onCancel ? (
                  <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
                    Cancel
                  </Button>
                ) : (
                  <Button asChild type="button" variant="outline" disabled={isLoading}>
                    <Link href={routes.workspaces.details(workspaceId)}>Cancel</Link>
                  </Button>
                )}
                <Button type="submit" variant="sidebar" disabled={isLoading}>
                  {isLoading ? 'Creating...' : 'Create Multi-Agentic System'}
                </Button>
              </div>
            </fieldset>
          </form>
        </Form>
      </BasePage>
    </div>
  );
}
