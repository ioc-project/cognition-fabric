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
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {routes} from '@/constants/routes';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {useCognitionEngine} from '@/hooks/useCognitionEngines';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {useCEToggleFlow} from '@/hooks/useCEToggleFlow';
import {useCEDeleteFlow} from '@/hooks/useCEDeleteFlow';
import {cognitionEngineApi, type CognitionEngineDetail} from '@/api/endpoints/cognition-engine';
import {cfnApi} from '@/api/endpoints';
import {swrKeys} from '@/lib/swr-config';
import useSWR from 'swr';
import {CognitionEngineDialogs} from '@/components/cognitive-agents/cognition-engine-dialogs';
import {CE_PURPOSES, UpdateCEFormSchema, type FormValues} from '@/components/cognitive-agents/cognition-engine-form-fields';
import {toast} from 'sonner';
import {StatusDot} from '@/components/ui/status-dot';
import {DetailTabs} from '@/components/ui/detail-tabs';
import {IdHoverCard} from '@/components/ui/id-hover-card';
import {CollapsibleJsonField} from '@/components/mas/collapsible-json-field';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import {MetaCard} from '@/components/ui/meta-card';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {Info} from 'lucide-react';

function ToggleDisplay({active, onClick}: {active: boolean; onClick?: () => void}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        height: '16px',
        width: '28px',
        flexShrink: 0,
        alignItems: 'center',
        borderRadius: '9999px',
        padding: '2px',
        transition: 'background-color 0.2s',
        backgroundColor: active ? 'hsl(var(--indicator-active))' : 'hsl(var(--muted-foreground) / 0.3)',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <div
        style={{
          height: '12px',
          width: '12px',
          borderRadius: '9999px',
          backgroundColor: 'hsl(var(--background))',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s',
          transform: active ? 'translateX(12px)' : 'translateX(0)'
        }}
      />
    </div>
  );
}

function toFormValues(ce: CognitionEngineDetail | undefined): FormValues {
  return {
    enforcing_url: ce?.enforcing_url ?? '',
    enforcing_endpoint: ce?.enforcing_endpoint ?? '',
    // Each purpose supports one protocol today, so the form always carries it
    enforcing_protocol: 'grpc',
    health_url: ce?.health_url ?? '',
    health_endpoint: ce?.health_endpoint ?? '',
    health_protocol: 'http',
    notification_url: ce?.notification_url ?? '',
    notification_endpoint: ce?.notification_endpoint ?? '',
    notification_protocol: 'http',
    enabled: ce ? (ce.enabled ? 'true' : 'false') : 'true',
    mas_auto_associate: ce?.mas_auto_associate ? 'true' : 'false'
  };
}

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
  const [activeTab, setActiveTab] = useState<'overview' | 'config'>('overview');
  const toggleFlow = useCEToggleFlow({cognitiveAgentId, ce, mutate});
  const deleteFlow = useCEDeleteFlow({
    cognitiveAgentId,
    ce,
    defaultWorkspaceId,
    mutate,
    onDeleted: () => router.push(routes.cognitiveAgents.list)
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateCEFormSchema),
    defaultValues: toFormValues(undefined)
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
      form.reset(toFormValues(ce));
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
      const updated = await cognitionEngineApi.patch(cognitiveAgentId as string, {
        // An empty value is sent as null, which clears it on the server
        enforcing_url: values.enforcing_url || null,
        enforcing_endpoint: values.enforcing_endpoint || null,
        enforcing_protocol: values.enforcing_protocol,
        health_url: values.health_url,
        health_endpoint: values.health_endpoint,
        health_protocol: values.health_protocol,
        // An empty value is sent as null, which clears it on the server
        notification_url: values.notification_url || null,
        notification_endpoint: values.notification_endpoint || null,
        notification_protocol: values.notification_protocol,
        enabled: values.enabled === 'true',
        mas_auto_associate: values.mas_auto_associate === 'true'
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
      form.reset(toFormValues(ce));
    }
  };

  return (
    <>
      <BasePage
        title={ce?.name || 'Cognition Engine'}
        customDescription={
          ce ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">v{ce.version}</span>
              <span className="text-muted-foreground/30 text-xs select-none">·</span>
              <StatusDot variant="health" active={ce.status === 'online'} />
              <span className="text-muted-foreground/30 text-xs select-none">·</span>
              <IdHoverCard value={ce.id} items={[{label: 'CE ID', value: ce.id}, ...(ce.cfn_id ? [{label: 'CFN', value: ce.cfn_id}] : [])]} />
            </div>
          ) : undefined
        }
        customInfo={
          <DetailTabs
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as typeof activeTab)}
            tabs={[
              {id: 'overview', label: 'Overview'},
              {id: 'config', label: 'Config'}
            ]}
          />
        }
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          ce && (
            <div className="flex items-center gap-0.5">
              {!isEditMode && (
                <>
                  <button
                    type="button"
                    onClick={toggleFlow.openToggleFlow}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <ToggleDisplay active={ce.enabled} />
                    <span>{ce.enabled ? 'Enabled' : 'Disabled'}</span>
                  </button>
                  <div className="w-px h-5 bg-border mx-1 shrink-0" />
                </>
              )}
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
                    <InfoRow label="Name" className={isEditMode ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
                      <span className="text-sm text-foreground font-mono">{ce?.name || '-'}</span>
                    </InfoRow>
                    <InfoRow label="Version" className={isEditMode ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
                      <span className="text-sm text-foreground font-mono">{ce?.version || '-'}</span>
                    </InfoRow>
                    <InfoRow label="CFN" className={isEditMode ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
                      <span className="text-sm text-foreground">{cfn?.name || '-'}</span>
                    </InfoRow>
                    <InfoRow label="MAS Auto Associate">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="mas_auto_associate"
                          render={({field}) => (
                            <FormItem>
                              <FormControl>
                                <ToggleDisplay
                                  active={field.value === 'true'}
                                  onClick={() => field.onChange(field.value === 'true' ? 'false' : 'true')}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <ToggleDisplay active={!!ce?.mas_auto_associate} />
                      )}
                    </InfoRow>
                    {isEditMode && (
                      <InfoRow label="Enabled">
                        <FormField
                          control={form.control}
                          name="enabled"
                          render={({field}) => (
                            <FormItem>
                              <FormControl>
                                <ToggleDisplay
                                  active={field.value === 'true'}
                                  onClick={() => field.onChange(field.value === 'true' ? 'false' : 'true')}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </InfoRow>
                    )}
                  </InfoPanel>

                  {CE_PURPOSES.map((purpose) => (
                    <div key={purpose.key} className="space-y-2">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {purpose.title}
                        {isEditMode && purpose.optional && <span className="ml-2 normal-case font-normal">Optional</span>}
                      </h3>
                      <InfoPanel>
                        <InfoRow label="Protocol">
                          {isEditMode ? (
                            <FormField
                              control={form.control}
                              name={`${purpose.key}_protocol`}
                              render={({field}) => (
                                <FormItem className="flex-1 space-y-1">
                                  <Select onValueChange={field.onChange} value={field.value} disabled={purpose.protocols.length < 2}>
                                    <FormControl>
                                      <SelectTrigger className="h-8 w-40 text-sm font-mono">
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {purpose.protocols.map((protocol) => (
                                        <SelectItem key={protocol} value={protocol}>
                                          {protocol.toUpperCase()}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          ) : (
                            <span className="text-sm text-foreground font-mono">{ce?.[`${purpose.key}_protocol`]?.toUpperCase() || '-'}</span>
                          )}
                        </InfoRow>
                        <InfoRow label={purpose.urlLabel}>
                          {isEditMode ? (
                            <FormField
                              control={form.control}
                              name={`${purpose.key}_url`}
                              render={({field}) => (
                                <FormItem className="flex-1 space-y-1">
                                  <FormControl>
                                    <input
                                      {...field}
                                      className="h-8 text-sm font-mono w-full border rounded px-2"
                                      placeholder={purpose.urlPlaceholder}
                                      autoComplete="off"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          ) : (
                            <span className="text-sm text-foreground font-mono">{ce?.[`${purpose.key}_url`] || '-'}</span>
                          )}
                        </InfoRow>
                        {purpose.hasEndpoint && (
                          <InfoRow label={purpose.endpointLabel}>
                            {isEditMode ? (
                              <FormField
                                control={form.control}
                                name={`${purpose.key}_endpoint`}
                                render={({field}) => (
                                  <FormItem className="flex-1 space-y-1">
                                    <FormControl>
                                      <input
                                        {...field}
                                        className="h-8 text-sm font-mono w-full border rounded px-2"
                                        placeholder={purpose.endpointPlaceholder}
                                        autoComplete="off"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            ) : (
                              <span className="text-sm text-foreground font-mono">{ce?.[`${purpose.key}_endpoint`] || '-'}</span>
                            )}
                          </InfoRow>
                        )}
                      </InfoPanel>
                    </div>
                  ))}

                  <div className="grid grid-cols-3 gap-3">
                    {ce?.created_at && (
                      <MetaCard label="Created" mono>
                        {new Date(ce.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                    {ce?.updated_at && (
                      <MetaCard label="Last Modified" mono>
                        {new Date(ce.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                    {ce?.last_seen && (
                      <MetaCard label="Last Seen" mono>
                        {new Date(ce.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'config' && (
                <div className="space-y-4">
                  <div className={`transition-opacity${isEditMode ? ' opacity-50' : ''}`}>
                    <CollapsibleJsonField
                      label="Default MAS Config"
                      labelSuffix={
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-default"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px] text-xs bg-popover text-left">
                              Override these settings per MAS from the MAS details page.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      }
                      value={ce?.mas_config && Object.keys(ce.mas_config).length > 0 ? JSON.stringify(ce.mas_config, null, 2) : ''}
                      isEditMode={false}
                    />
                  </div>
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
