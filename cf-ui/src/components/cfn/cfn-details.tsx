// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useEffect, useState, useCallback} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {swrKeys} from '@/lib/swr-config';
import {cfnApi} from '@/api/endpoints';
import type {Cfn, UpdateCfnRequest} from '@/api/types/cfn';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';
import {BasePage} from '@/components/ui/base-page';
import {Input} from '@/components/ui/input';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {routes, breadcrumbs} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS, parseError} from '@/lib/utils';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {toast} from 'sonner';
import {StatusDot} from '@/components/ui/status-dot';
import {DetailTabs} from '@/components/ui/detail-tabs';
import {InlineId} from '@/components/ui/inline-id';
import {InfoPanel, InfoRow} from '@/components/ui/info-panel';
import {MetaCard} from '@/components/ui/meta-card';
import {Badge} from '@/components/ui/badge';
import {BrainCircuit, Database, Network} from 'lucide-react';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {ActionButton} from '@/components/ui/action-button';
import {dtSectionHeader, dtPanelHeader} from '@/lib/detail-typography';
import {KindsSubkindsDisplay} from '@/components/ui/kinds-subkinds-display';

interface CfnMAS {
  id: string;
  name: string;
  agents?: {agent_id: string; name?: string}[];
  shared_memory?: {id: string; name: string} | null;
  cognition_engines?: {id: string; name: string}[];
}

interface CfnMemoryProvider {
  id: string;
  name: string;
  enabled: boolean;
  description?: string | null;
}

interface CfnConfig {
  cognition_engines?: CognitionEngineListItem[];
  memory_providers?: CfnMemoryProvider[];
  workspaces?: {workspace_id: string; workspace_name?: string; multi_agentic_systems?: CfnMAS[]}[];
  config_version?: number;
}

const UpdateCfnFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  ip_address: z.string().min(1, 'IP Address is required'),
  port: z
    .string()
    .min(1, 'Port is required')
    .refine(
      (val) => {
        const num = parseInt(val, 10);
        return !isNaN(num) && num > 0 && num <= 65535;
      },
      {message: 'Port must be a number between 1 and 65535'}
    )
});

type FormValues = z.infer<typeof UpdateCfnFormSchema>;

export default function CfnDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rawCfnId = params?.cfnId as string | string[] | undefined;
  const cfnId = Array.isArray(rawCfnId) ? rawCfnId[0] : rawCfnId;

  const [isEditMode, setIsEditMode] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'cognition-engines' | 'memory-providers' | 'workspaces'>('overview');
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const {data: cfn, error, isLoading, mutate} = useSWR<Cfn>(cfnId ? swrKeys.cfnDetails(cfnId) : null, () => cfnApi.get(cfnId as string));

  const form = useForm<FormValues>({
    resolver: zodResolver(UpdateCfnFormSchema),
    defaultValues: {name: '', ip_address: '', port: ''}
  });

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (cfn) {
      form.reset({
        name: cfn.name,
        ip_address: cfn.ip_address || '',
        port: cfn.port ? String(cfn.port) : ''
      });
    }
  }, [cfn, form]);

  useEffect(() => {
    if (cfnId === undefined) {
      router.replace('/not-found');
    }
  }, [cfnId, router]);

  const crumbs = breadcrumbs.cfnDetails(cfn?.name || 'CFN');

  const handleToggleEnabled = useCallback(async () => {
    if (!cfn || !cfnId) {
      return;
    }
    setIsToggling(true);
    try {
      if (cfn.enabled) {
        await cfnApi.disable(cfnId);
      } else {
        await cfnApi.enable(cfnId);
      }
      await mutate();
      await globalMutate(swrKeys.cfnTopology());
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setIsToggling(false);
    }
  }, [cfn, cfnId, mutate]);

  const handleDelete = useCallback(async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await cfnApi.delete(data.id);
        toast.success(`"${data.name}" removed successfully`);
        router.push(routes.cfn.list);
        await globalMutate(swrKeys.cfnTopology());
      } catch (err) {
        toast.error(parseError(err));
        throw err;
      }
    });
  }, [deleteDialog, router]);

  const handleSave = async (values: FormValues) => {
    try {
      const payload: UpdateCfnRequest = {
        name: values.name,
        ip_address: values.ip_address,
        port: parseInt(values.port, 10)
      };
      await cfnApi.update(cfnId as string, payload);
      toast.success('Cognition Fabric Node updated successfully');
      await mutate();
      await globalMutate(swrKeys.cfnTopology());
      setIsEditMode(false);
      router.replace(routes.cfn.details(cfnId!));
    } catch (err) {
      toast.error(parseError(err));
      throw err;
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    form.reset({name: cfn?.name, ip_address: cfn?.ip_address || '', port: cfn?.port ? String(cfn.port) : ''});
    router.replace(routes.cfn.details(cfnId!));
  };

  const cfnConfig: CfnConfig = cfn?.config !== null && typeof cfn?.config === 'object' ? (cfn.config as CfnConfig) : {};
  const cognitionEngines = cfnConfig.cognition_engines ?? [];
  const memoryProviders = cfnConfig.memory_providers ?? [];
  const allMAS = (cfnConfig.workspaces ?? []).flatMap((w) => w.multi_agentic_systems ?? []);

  return (
    <>
      <BasePage
        title={cfn?.name || 'CFN Details'}
        customDescription={
          cfn ? (
            <div className="flex items-center gap-3 flex-wrap">
              <StatusDot variant="health" active={cfn.status === 'online'} />
              <span className="text-muted-foreground/30 text-xs select-none">·</span>
              <StatusDot variant="state" active={cfn.enabled} />
              <span className="text-muted-foreground/30 text-xs select-none">·</span>
              <InlineId value={cfn.id} />
            </div>
          ) : undefined
        }
        customInfo={
          <DetailTabs
            activeTab={activeTab}
            onTabChange={(id) => {
              if (id !== 'overview' && isEditMode) {
                handleCancelEdit();
              }
              setActiveTab(id as typeof activeTab);
            }}
            tabs={[
              {id: 'overview', label: 'Overview'},
              {id: 'cognition-engines', label: 'Cognition Engines', count: cognitionEngines.length || undefined},
              {id: 'memory-providers', label: 'Memory Providers', count: memoryProviders.length || undefined},
              {id: 'workspaces', label: 'Multi-Agentic Systems', count: allMAS.length || undefined}
            ]}
          />
        }
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          cfn && (
            <div className="flex items-center gap-0.5">
              {!isEditMode && <ActionButton label={cfn.enabled ? 'Disable' : 'Enable'} onClick={handleToggleEnabled} disabled={isToggling} />}
              <DetailsPageActions
                onEdit={activeTab === 'overview' ? () => setIsEditMode(true) : undefined}
                onDelete={() => deleteDialog.open({id: cfn.id, name: cfn.name})}
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
          data={cfn}
          error={error}
          itemName="CFN details"
          customIsLoading={isLoading}
          errorListStateProps={{title: 'Failed to load CFN details'}}
          emptyListStateProps={{title: 'No CFN details found'}}
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
                                <Input {...field} className="h-8 text-sm" maxLength={100} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <span className="text-sm text-foreground">{cfn?.name || '—'}</span>
                      )}
                    </InfoRow>
                    <InfoRow label="IP Address">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="ip_address"
                          render={({field}) => (
                            <FormItem className="flex-1 space-y-1">
                              <FormControl>
                                <Input {...field} className="h-8 text-sm font-mono" placeholder="192.168.1.100" autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <span className="text-sm text-foreground font-mono">{cfn?.ip_address ? cfn.ip_address.replace(/^"|"$/g, '') : '—'}</span>
                      )}
                    </InfoRow>
                    <InfoRow label="Port">
                      {isEditMode ? (
                        <FormField
                          control={form.control}
                          name="port"
                          render={({field}) => (
                            <FormItem className="flex-1 space-y-1">
                              <FormControl>
                                <Input {...field} type="number" className="h-8 text-sm font-mono" placeholder="8080" autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <span className="text-sm text-foreground font-mono">{cfn?.port ? String(cfn.port) : '—'}</span>
                      )}
                    </InfoRow>
                    {cfnConfig.config_version !== undefined && (
                      <InfoRow label="Config Version" className={isEditMode ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
                        <span className="text-sm text-foreground font-mono">v{cfnConfig.config_version}</span>
                      </InfoRow>
                    )}
                  </InfoPanel>

                  <div className="grid grid-cols-3 gap-3">
                    {cfn?.created_at && (
                      <MetaCard label="Created" mono>
                        {new Date(cfn.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                    {cfn?.last_seen && (
                      <MetaCard label="Last Seen" mono>
                        {new Date(cfn.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                    {cfn?.updated_at && (
                      <MetaCard label="Last Modified" mono>
                        {new Date(cfn.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}
                      </MetaCard>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'cognition-engines' && (
                <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                  <div className={dtPanelHeader}>
                    <div className="flex items-center gap-0.5">
                      <BrainCircuit size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                      <span className={dtSectionHeader}>Cognition Engines</span>
                      {cognitionEngines.length > 0 && (
                        <Badge variant="accent" className="rounded px-1.5">
                          {cognitionEngines.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {cognitionEngines.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Kinds</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Enabled</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cognitionEngines.map((ce) => (
                          <TableRow key={ce.id}>
                            <TableCell className="font-medium">{ce.name}</TableCell>
                            <TableCell>
                              <KindsSubkindsDisplay kindsSubkinds={ce.kinds_subkinds} />
                            </TableCell>
                            <TableCell>
                              <StatusDot variant="health" active={ce.status === 'online'} />
                            </TableCell>
                            <TableCell>
                              <StatusDot variant="state" active={!!ce.enabled} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="px-5 py-4 text-sm text-muted-foreground">No Cognition Engines registered.</p>
                  )}
                </div>
              )}

              {activeTab === 'memory-providers' && (
                <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                  <div className={dtPanelHeader}>
                    <div className="flex items-center gap-0.5">
                      <Database size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                      <span className={dtSectionHeader}>Memory Providers</span>
                      {memoryProviders.length > 0 && (
                        <Badge variant="accent" className="rounded px-1.5">
                          {memoryProviders.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {memoryProviders.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Enabled</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {memoryProviders.map((mp) => (
                          <TableRow key={mp.id}>
                            <TableCell className="font-medium">{mp.name}</TableCell>
                            <TableCell>
                              <StatusDot variant="state" active={mp.enabled} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">{mp.description || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="px-5 py-4 text-sm text-muted-foreground">No memory providers registered.</p>
                  )}
                </div>
              )}

              {activeTab === 'workspaces' && (
                <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
                  <div className={dtPanelHeader}>
                    <div className="flex items-center gap-0.5">
                      <Network size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                      <span className={dtSectionHeader}>Multi-Agentic Systems</span>
                      {allMAS.length > 0 && (
                        <Badge variant="accent" className="rounded px-1.5">
                          {allMAS.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {allMAS.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Agents</TableHead>
                          <TableHead>Shared Memory</TableHead>
                          <TableHead>Attached Cognition Engines</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allMAS.map((mas) => (
                          <TableRow key={mas.id}>
                            <TableCell className="font-medium">{mas.name}</TableCell>
                            <TableCell className="text-muted-foreground">{mas.agents?.length ?? 0}</TableCell>
                            <TableCell className="text-muted-foreground">{mas.shared_memory?.name || '—'}</TableCell>
                            <TableCell className="text-muted-foreground">{mas.cognition_engines?.length ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="px-5 py-4 text-sm text-muted-foreground">No Multi-Agentic Systems found.</p>
                  )}
                </div>
              )}
            </form>
          </Form>
        </ConditionalSWRRenderer>
      </BasePage>
      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.close}
        onConfirm={handleDelete}
        title={`Remove ${deleteDialog.data?.name || 'CFN Node'}`}
        description={`Are you sure you want to remove "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Remove"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
