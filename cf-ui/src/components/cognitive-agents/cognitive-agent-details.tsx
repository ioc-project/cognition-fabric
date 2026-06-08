'use client';

import {useState, useEffect} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {mutate as globalMutate} from 'swr';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {useCognitionEngine} from '@/hooks/useCognitionEngines';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {useCEToggleFlow} from '@/hooks/useCEToggleFlow';
import {useCEDeleteFlow} from '@/hooks/useCEDeleteFlow';
import {cognitionEngineApi} from '@/api/endpoints/cognition-engine';
import {swrKeys} from '@/lib/swr-config';
import {CognitionEngineDialogs} from '@/components/cognitive-agents/cognition-engine-dialogs';
import {CognitionEngineFormFields, UpdateCEFormSchema, type FormValues} from '@/components/cognitive-agents/cognition-engine-form-fields';
import {toast} from 'sonner';

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
          ce && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ce.status === 'online' ? 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'}`}
              >
                {ce.status === 'online' ? 'Online' : 'Offline'}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ce.enabled ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'}`}
              >
                {ce.enabled ? 'Enabled' : 'Disabled'}
              </span>
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
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <CognitionEngineFormFields
                  ce={ce}
                  form={form}
                  isEditMode={isEditMode}
                  configExpanded={configExpanded}
                  setConfigExpanded={setConfigExpanded}
                  masConfigExpanded={masConfigExpanded}
                  setMasConfigExpanded={setMasConfigExpanded}
                  onSubmit={handleSave}
                />
              </CardContent>
            </Card>
          </div>
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
