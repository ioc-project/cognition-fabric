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
import {Card, CardContent} from '@/components/ui/card';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {toast} from 'sonner';
import {Network} from 'lucide-react';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {MASAuditLog} from './mas-audit-log';
import {MASFormFields} from './mas-form-fields';
import {MASAssociateCEModal} from './mas-associate-ce-modal';
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
  const [cesSectionExpanded, setCesSectionExpanded] = useState(true);
  const [expandedCEs, setExpandedCEs] = useState<Record<string, boolean>>({});
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
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <MASFormFields
                  mas={mas}
                  form={form}
                  isEditMode={isEditMode}
                  masConfigExpanded={masConfigExpanded}
                  setMasConfigExpanded={setMasConfigExpanded}
                  agentFields={agentFields}
                  appendAgent={appendAgent}
                  removeAgent={removeAgent}
                  agentExpandedState={agentExpandedState}
                  setAgentExpandedState={setAgentExpandedState}
                  sharedMemoryProviders={sharedMemoryProviders}
                  userMemoryProviders={userMemoryProviders}
                  cesSectionExpanded={cesSectionExpanded}
                  setCesSectionExpanded={setCesSectionExpanded}
                  expandedCEs={expandedCEs}
                  setExpandedCEs={setExpandedCEs}
                  availableCEs={availableCEs}
                  disassociatingId={disassociatingId}
                  onDisassociateCE={handleDisassociateCE}
                  onOpenAssociateModal={() => setAssociateModalOpen(true)}
                  onSubmit={handleSave}
                />
              </CardContent>
            </Card>
          </div>
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
