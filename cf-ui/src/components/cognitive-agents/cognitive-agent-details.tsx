// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState, useEffect} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {mutate as globalMutate} from 'swr';
import {BasePage} from '@/components/ui/base-page';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {routes} from '@/constants/routes';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {useCognitionEngine} from '@/hooks/useCognitionEngines';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {useCEToggleFlow} from '@/hooks/useCEToggleFlow';
import {useCEDeleteFlow} from '@/hooks/useCEDeleteFlow';
import {cognitionEngineApi} from '@/api/endpoints/cognition-engine';
import {cfnApi} from '@/api/endpoints';
import {swrKeys} from '@/lib/swr-config';
import useSWR from 'swr';
import {CognitionEngineDialogs} from '@/components/cognitive-agents/cognition-engine-dialogs';
import {UpdateCEFormSchema, type FormValues} from '@/components/cognitive-agents/cognition-engine-form-fields';
import {toast} from 'sonner';
import {StatusDot} from '@/components/ui/status-dot';
import {DetailTabs} from '@/components/ui/detail-tabs';
import {InlineId} from '@/components/ui/inline-id';
import {CollapsibleJsonField} from '@/components/mas/collapsible-json-field';
import {dtPanelHeader, dtSectionHeader} from '@/lib/detail-typography';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import {MetaCard} from '@/components/ui/meta-card';

export default function CognitiveAgentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const {defaultWorkspaceId} = useDefaultWorkspace();

  const rawCognitiveAgentId = (params as Record<string, string | string[] | undefined>)?.cognitiveAgentId;
  const cognitiveAgentId = Array.isArray(rawCognitiveAgentId) ? rawCognitiveAgentId[0] : rawCognitiveAgentId;

  const {cognitionEngine: ce, error, isLoading, mutate} = useCognitionEngine(cognitiveAgentId as string);
  const {data: cfn} = useSWR(ce?.cfn_id ? swrKeys.cfnDetails(ce.cfn_id) : null, () => cfnApi.get(ce!.cfn_id));

  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'capabilities' | 'config'>('overview');

  const toggleFlow = useCEToggleFlow({cognitiveAgentId, ce, defaultWorkspaceId, mutate});
  const deleteFlow = useCEDeleteFlow({
    cognitiveAgentId,
    ce,
    defaultWorkspaceId,
    mutate,
    onDeleted: () => router.push(routes.cognitiveAgents.list)
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateCEFormSchema),
    defaultValues: {url: '', enabled: 'true', mas_auto_associate: 'false', capabilities: '', metrics: '', config: '', mas_config: ''}
  });

  useEffect(() => {
    if (!cognitiveAgentId) {
      router.replace('/not-found');
    }
  }, [cognitiveAgentId, router]);

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (ce) {
      form.reset({
        url: ce.url || '',
        enabled: ce.enabled ? 'true' : 'false',
        mas_auto_associate: ce.mas_auto_associate ? 'true' : 'false',
        capabilities: ce.capabilities ? ce.capabilities.join('\n') : '',
        metrics: ce.metrics ? ce.metrics.join('\n') : '',
        config: ce.config && Object.keys(ce.config).length > 0 ? JSON.stringify(ce.config, null, 2) : '',
        mas_config: ce.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''
      });
    }
  }, [ce, form]);

  const crumbs = ce
    ? [
        {link: routes.cognitiveAgents.list, text: 'Cognition Engines'},
        {link: '', text: ce.name, active: true}
      ]
    : undefined;

  const handleSave = async (values: FormValues) => {
    try {
      const parseJsonField = (value?: string) => (!value?.trim() ? undefined : (JSON.parse(value) as Record<string, unknown>));
      const parseArrayField = (value?: string) =>
        value
          ? value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const updated = await cognitionEngineApi.patch(cognitiveAgentId as string, {
        url: values.url || undefined,
        enabled: values.enabled === 'true',
        mas_auto_associate: values.mas_auto_associate === 'true',
        capabilities: parseArrayField(values.capabilities),
        metrics: parseArrayField(values.metrics),
        config: parseJsonField(values.config),
        mas_config: parseJsonField(values.mas_config)
      });

      toast.success('Cognition Engine updated successfully');
      await mutate(updated, {revalidate: false});
      await globalMutate(swrKeys.cognitionEngines());
      setIsEditMode(false);
    } catch (err) {
      toast.error(parseError(err));
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    if (ce) {
      form.reset({
        url: ce.url || '',
        enabled: ce.enabled ? 'true' : 'false',
        mas_auto_associate: ce.mas_auto_associate ? 'true' : 'false',
        capabilities: ce.capabilities ? ce.capabilities.join('\n') : '',
        metrics: ce.metrics ? ce.metrics.join('\n') : '',
        config: ce.config && Object.keys(ce.config).length > 0 ? JSON.stringify(ce.config, null, 2) : '',
        mas_config: ce.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''
      });
    }
  };

  return (
    <>
      <BasePage
        title={ce?.name || 'Cognition Engine'}
        customDescription={
          ce ? (
            <div className="flex items-center gap-3 flex-wrap">
              <StatusDot variant="health" active={ce.status === 'online'} />
              <span className="text-muted-foreground/30 text-xs select-none">·</span>
              <StatusDot variant="state" active={ce.enabled} />
              <span className="text-muted-foreground/30 text-xs select-none">·</span>
              <InlineId label="ID" value={ce.id} />
            </div>
          ) : undefined
        }
        customInfo={
          <DetailTabs
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as typeof activeTab)}
            tabs={[
              {id: 'overview', label: 'Overview'},
              {id: 'capabilities', label: 'Capabilities'},
              {id: 'config', label: 'Config'}
            ]}
          />
        }
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          ce && (
            <div className="flex items-center gap-2">
              {!isEditMode && (
                <Button variant={ce.enabled ? 'outline' : 'sidebar'} size="sm" onClick={toggleFlow.openToggleFlow}>
                  {ce.enabled ? 'Disable' : 'Enable'}
                </Button>
              )}
              <div className="w-px h-5 bg-border mx-1 shrink-0" />
              <DetailsPageActions
                onDelete={deleteFlow.openDeleteFlow}
                deleteDisabled={ce?.enabled}
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
          data={ce}
          error={error}
          customIsLoading={isLoading}
          itemName="Cognition Engine details"
          errorListStateProps={{title: 'Failed to load Cognition Engine details'}}
          emptyListStateProps={{title: 'No details found'}}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">

              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <InfoPanel>
                    <InfoRow label="Kind">
                      <span className="text-sm text-foreground font-mono">{ce?.kind || '—'}</span>
                    </InfoRow>
                    <InfoRow label="Subkind">
                      <span className="text-sm text-foreground font-mono">{ce?.subkind || '—'}</span>
                    </InfoRow>
                    <InfoRow label="Version">
                      <span className="text-sm text-foreground font-mono">{ce?.version || '—'}</span>
                    </InfoRow>
                    <InfoRow label="CFN">
                      <span className="text-sm text-foreground">{cfn?.name || '—'}</span>
                    </InfoRow>
                    <InfoRow label="MAS Auto Associate">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="mas_auto_associate"
                          render={({field}) => (
                            <FormItem className="flex-1 space-y-1">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="true">Enabled</SelectItem>
                                  <SelectItem value="false">Disabled</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <StatusDot variant="state" active={!!ce?.mas_auto_associate} />
                      )}
                    </InfoRow>
                    <InfoRow label="Enabled">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="enabled"
                          render={({field}) => (
                            <FormItem className="flex-1 space-y-1">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="true">Enabled</SelectItem>
                                  <SelectItem value="false">Disabled</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <StatusDot variant="state" active={!!ce?.enabled} />
                      )}
                    </InfoRow>
                  </InfoPanel>

                  <div className="grid grid-cols-3 gap-3">
                    {ce?.created_at && (
                      <MetaCard label="Created" mono>{new Date(ce.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</MetaCard>
                    )}
                    {ce?.updated_at && (
                      <MetaCard label="Last Modified" mono>{new Date(ce.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</MetaCard>
                    )}
                    {ce?.last_seen && (
                      <MetaCard label="Last Seen" mono>{new Date(ce.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</MetaCard>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'capabilities' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                    <div className={dtPanelHeader}>
                      <span className={dtSectionHeader}>Capabilities</span>
                    </div>
                    <div className="p-4">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="capabilities"
                          render={({field}) => (
                            <FormItem>
                              <FormControl>
                                <Textarea {...field} placeholder="one capability per line" className="font-mono text-xs min-h-[120px] resize-none" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {ce?.capabilities && ce.capabilities.length > 0 ? (
                            ce.capabilities.map((cap) => (
                              <span key={cap} className="font-mono text-xs text-muted-foreground bg-muted border border-border rounded px-2 py-0.5">
                                {cap}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                    <div className={dtPanelHeader}>
                      <span className={dtSectionHeader}>Metrics</span>
                    </div>
                    <div className="p-4">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="metrics"
                          render={({field}) => (
                            <FormItem>
                              <FormControl>
                                <Textarea {...field} placeholder="one metric per line" className="font-mono text-xs min-h-[120px] resize-none" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {ce?.metrics && ce.metrics.length > 0 ? (
                            ce.metrics.map((metric) => (
                              <span key={metric} className="font-mono text-xs text-muted-foreground bg-muted border border-border rounded px-2 py-0.5">
                                {metric}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'config' && (
                <div className="space-y-4">
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
                          placeholder={'{\n  "key": "value"\n}'}
                        />
                      )}
                    />
                  ) : (
                    <CollapsibleJsonField
                      label="Config"
                      value={ce?.config && Object.keys(ce.config).length > 0 ? JSON.stringify(ce.config, null, 2) : ''}
                      isEditMode={false}
                    />
                  )}
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="mas_config"
                      render={({field}) => (
                        <CollapsibleJsonField
                          label="MAS Config"
                          value={field.value ?? ''}
                          isEditMode={true}
                          field={field}
                          placeholder={'{\n  "key": "value"\n}'}
                        />
                      )}
                    />
                  ) : (
                    <CollapsibleJsonField
                      label="MAS Config"
                      value={ce?.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''}
                      isEditMode={false}
                    />
                  )}
                </div>
              )}

            </form>
          </Form>
        </ConditionalSWRRenderer>
      </BasePage>

      <CognitionEngineDialogs
        toggleCeName={ce?.name}
        toggleCeEnabled={ce?.enabled}
        toggleStep={toggleFlow.toggleStep}
        setToggleStep={toggleFlow.setToggleStep}
        toggleAssociatedMas={toggleFlow.toggleAssociatedMas}
        toggleDisassociatedIds={toggleFlow.toggleDisassociatedIds}
        toggleDisassociatingIds={toggleFlow.toggleDisassociatingIds}
        togglePendingMas={toggleFlow.togglePendingMas}
        onToggleDisassociate={toggleFlow.handleToggleDisassociate}
        onConfirmToggle={toggleFlow.handleConfirmToggle}
        isTogglingEnabled={toggleFlow.isTogglingEnabled}
        deleteCeName={ce?.name}
        deleteStep={deleteFlow.deleteStep}
        setDeleteStep={deleteFlow.setDeleteStep}
        setDisableError={deleteFlow.setDisableError}
        setDeleteError={deleteFlow.setDeleteError}
        hasDisabled={deleteFlow.hasDisabled}
        associatedMas={deleteFlow.associatedMas}
        disassociatedIds={deleteFlow.disassociatedIds}
        disassociatingIds={deleteFlow.disassociatingIds}
        pendingMas={deleteFlow.pendingMas}
        onDisassociate={deleteFlow.handleDisassociate}
        onDisable={deleteFlow.handleDisable}
        onDelete={deleteFlow.handleDelete}
        isDisabling={deleteFlow.isDisabling}
        isDeleting={deleteFlow.isDeleting}
        disableError={deleteFlow.disableError}
        deleteError={deleteFlow.deleteError}
      />
    </>
  );
}
