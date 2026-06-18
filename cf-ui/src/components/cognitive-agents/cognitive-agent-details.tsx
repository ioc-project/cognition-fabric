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
import {CopyableInput} from '@/components/ui/copyable-input';
import {routes} from '@/constants/routes';
import {parseError, DATE_TIME_FORMAT_OPTIONS, validateJSON, formatJson} from '@/lib/utils';
import {useCognitionEngine} from '@/hooks/useCognitionEngines';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {useCEToggleFlow} from '@/hooks/useCEToggleFlow';
import {useCEDeleteFlow} from '@/hooks/useCEDeleteFlow';
import {cognitionEngineApi} from '@/api/endpoints/cognition-engine';
import {swrKeys} from '@/lib/swr-config';
import {CognitionEngineDialogs} from '@/components/cognitive-agents/cognition-engine-dialogs';
import {UpdateCEFormSchema, type FormValues} from '@/components/cognitive-agents/cognition-engine-form-fields';
import {toast} from 'sonner';
import {Badge} from '@/components/ui/badge';
import {ChevronDown, ChevronUp} from 'lucide-react';
import {dtLabel, dtValue, dtRow, dtSectionHeader} from '@/lib/detail-typography';

export default function CognitiveAgentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const {defaultWorkspaceId} = useDefaultWorkspace();

  const rawCognitiveAgentId = (params as Record<string, string | string[] | undefined>)?.cognitiveAgentId;
  const cognitiveAgentId = Array.isArray(rawCognitiveAgentId) ? rawCognitiveAgentId[0] : rawCognitiveAgentId;

  const {cognitionEngine: ce, error, isLoading, mutate} = useCognitionEngine(cognitiveAgentId as string);

  const [isEditMode, setIsEditMode] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [masConfigExpanded, setMasConfigExpanded] = useState(true);

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

  const configWatch = form.watch('config');
  const masConfigWatch = form.watch('mas_config');

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

  const rowClass = dtRow;
  const labelClass = dtLabel;
  const valueClass = dtValue;

  const configEntries = ce?.config && Object.keys(ce.config).length > 0 ? Object.entries(ce.config) : [];
  const masConfigEntries = ce?.mas_config && Object.keys(ce.mas_config).length > 0 ? Object.entries(ce.mas_config) : [];

  return (
    <>
      <BasePage
        title={ce?.name || 'Cognition Engine'}
        customDescription={
          ce && (
            <div className="flex items-center gap-2">
              <Badge variant={ce.status === 'online' ? 'success' : 'inactive'}>{ce.status === 'online' ? 'Online' : 'Offline'}</Badge>
              <Badge variant={ce.enabled ? 'info' : 'inactive'}>{ce.enabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
          )
        }
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          ce && (
            <div className="flex gap-2">
              {!isEditMode && (
                <Button variant={ce.enabled ? 'outline' : 'sidebar'} size="sm" onClick={toggleFlow.openToggleFlow}>
                  {ce.enabled ? 'Disable' : 'Enable'}
                </Button>
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
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4 mx-8">

              {/* DETAILS card */}
              <div className="bg-card border border-border rounded p-4">
                <div className={`${dtSectionHeader} mb-3`}>Details</div>

                <div className={rowClass}>
                  <span className={labelClass}>Name</span>
                  <span className={valueClass}>{ce?.name || '-'}</span>
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>Version</span>
                  <span className={valueClass}>{ce?.version || '-'}</span>
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>Kind</span>
                  <span className={valueClass}>{ce?.kind || '-'}</span>
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>Subkind</span>
                  <span className={valueClass}>{ce?.subkind || '-'}</span>
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>URL</span>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="url"
                      render={({field}) => (
                        <FormItem className="space-y-1">
                          <FormControl><Input {...field} className="h-7 text-xs font-mono" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <span className={valueClass}>{ce?.url || '-'}</span>
                  )}
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>CFN ID</span>
                  <div className="min-w-0"><CopyableInput value={ce?.cfn_id || ''} /></div>
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>MAS Auto Associate</span>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="mas_auto_associate"
                      render={({field}) => (
                        <FormItem className="space-y-1">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
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
                    <Badge variant={ce?.mas_auto_associate ? 'info' : 'inactive'} className="w-fit">{ce?.mas_auto_associate ? 'Enabled' : 'Disabled'}</Badge>
                  )}
                </div>
                {isEditMode && (
                  <div className={rowClass}>
                    <span className={labelClass}>Enabled</span>
                    <FormField
                      control={form.control}
                      name="enabled"
                      render={({field}) => (
                        <FormItem className="space-y-1">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
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
                  </div>
                )}
                {ce?.last_seen && (
                  <div className={rowClass}>
                    <span className={labelClass}>Last Seen</span>
                    <span className={valueClass}>{new Date(ce.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
                  </div>
                )}
                <div className={rowClass}>
                  <span className={labelClass}>Created At</span>
                  <span className={valueClass}>{ce?.created_at ? new Date(ce.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : '—'}</span>
                </div>
                <div className={rowClass}>
                  <span className={labelClass}>Updated At</span>
                  <span className={valueClass}>{ce?.updated_at ? new Date(ce.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : '—'}</span>
                </div>
              </div>

              {/* CAPABILITIES + METRICS */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded p-4">
                  <div className={`${dtSectionHeader} mb-3`}>Capabilities</div>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="capabilities"
                      render={({field}) => (
                        <FormItem>
                          <FormControl>
                            <Textarea {...field} placeholder="one capability per line" className="font-mono text-xs min-h-[80px] resize-none" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ce?.capabilities && ce.capabilities.length > 0
                        ? ce.capabilities.map((cap) => (
                            <span key={cap} className="font-mono text-xs text-muted-foreground bg-muted border border-border rounded px-2 py-0.5">
                              {cap}
                            </span>
                          ))
                        : <span className={valueClass}>—</span>}
                    </div>
                  )}
                </div>
                <div className="bg-card border border-border rounded p-4">
                  <div className={`${dtSectionHeader} mb-3`}>Metrics</div>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="metrics"
                      render={({field}) => (
                        <FormItem>
                          <FormControl>
                            <Textarea {...field} placeholder="one metric per line" className="font-mono text-xs min-h-[80px] resize-none" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ce?.metrics && ce.metrics.length > 0
                        ? ce.metrics.map((metric) => (
                            <span key={metric} className="font-mono text-xs text-muted-foreground bg-muted border border-border rounded px-2 py-0.5">
                              {metric}
                            </span>
                          ))
                        : <span className={valueClass}>—</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* CONFIG collapsible */}
              <div className="bg-card border border-border rounded overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-muted/80 transition-colors border-b border-border"
                  onClick={() => setConfigExpanded((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <span className={dtSectionHeader}>Config</span>
                    {isEditMode && configWatch && configWatch.trim() !== '' && (
                      <span className={`text-xs px-2 py-0.5 rounded ${validateJSON(configWatch) ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                        {validateJSON(configWatch) ? 'Valid JSON' : 'Invalid JSON'}
                      </span>
                    )}
                  </div>
                  {configExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
                </button>

                {configExpanded && (
                  <div className="p-4">
                    {isEditMode ? (
                      <FormField
                        control={form.control}
                        name="config"
                        render={({field}) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                placeholder={'{\n  "key": "value"\n}'}
                                className="font-mono text-sm min-h-[150px] resize-y"
                                {...field}
                                onBlur={() => field.onChange(formatJson(field.value || ''))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : configEntries.length === 0 ? (
                      <span className={valueClass}>—</span>
                    ) : (
                      configEntries.map(([key, value], i) => (
                        <div key={key} className={`grid grid-cols-[180px_1fr] items-start gap-3 py-2.5 ${i < configEntries.length - 1 ? 'border-b border-border' : ''}`}>
                          <span className={labelClass}>{key}</span>
                          <span className={valueClass}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* MAS CONFIG collapsible */}
              <div className="bg-card border border-border rounded overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-muted/80 transition-colors border-b border-border"
                  onClick={() => setMasConfigExpanded((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <span className={dtSectionHeader}>MAS Config</span>
                    {isEditMode && masConfigWatch && masConfigWatch.trim() !== '' && (
                      <span className={`text-xs px-2 py-0.5 rounded ${validateJSON(masConfigWatch) ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                        {validateJSON(masConfigWatch) ? 'Valid JSON' : 'Invalid JSON'}
                      </span>
                    )}
                  </div>
                  {masConfigExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
                </button>

                {masConfigExpanded && (
                  <div className="p-4">
                    {isEditMode ? (
                      <FormField
                        control={form.control}
                        name="mas_config"
                        render={({field}) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                placeholder={'{\n  "key": "value"\n}'}
                                className="font-mono text-sm min-h-[150px] resize-y"
                                {...field}
                                onBlur={() => field.onChange(formatJson(field.value || ''))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : masConfigEntries.length === 0 ? (
                      <span className={valueClass}>—</span>
                    ) : (
                      masConfigEntries.map(([key, value], i) => (
                        <div key={key} className={`grid grid-cols-[180px_1fr] items-start gap-3 py-2.5 ${i < masConfigEntries.length - 1 ? 'border-b border-border' : ''}`}>
                          <span className={labelClass}>{key}</span>
                          <span className={valueClass}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

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
