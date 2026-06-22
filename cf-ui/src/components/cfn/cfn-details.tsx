'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter, useSearchParams} from 'next/navigation';
import useSWR, {mutate as globalMutate} from 'swr';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {BrainCircuit, Workflow, HardDrive, Settings2, ChevronDown, ChevronUp} from 'lucide-react';
import {swrKeys} from '@/lib/swr-config';
import {cfnApi} from '@/api/endpoints';
import type {Cfn, UpdateCfnRequest} from '@/api/types/cfn';
import {BasePage} from '@/components/ui/base-page';
import {Input} from '@/components/ui/input';
import {Form, FormControl, FormField, FormItem, FormMessage} from '@/components/ui/form';
import {Badge} from '@/components/ui/badge';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {routes, breadcrumbs} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS, parseError} from '@/lib/utils';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
import {toast} from 'sonner';
import {CopyableInput} from '@/components/ui/copyable-input';
import {StatCard} from '@/components/ui/stat-card';
import {dtLabel, dtSectionHeader, dtMetaLabel, dtMetaValue, dtPanelHeaderInteractive} from '@/lib/detail-typography';

interface CfnCE {
  id: string;
  name: string;
  kind?: string | null;
  subkind?: string | null;
  status?: string;
  enabled?: boolean;
}

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
  cognition_engines?: CfnCE[];
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
  const [ceExpanded, setCeExpanded] = useState(true);
  const [masExpanded, setMasExpanded] = useState(true);
  const [mpExpanded, setMpExpanded] = useState(true);

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
      await globalMutate(swrKeys.cfn());
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

  const cfnConfig = (cfn?.config as CfnConfig | null) ?? {};
  const cognitionEngines = cfnConfig.cognition_engines ?? [];
  const memoryProviders = cfnConfig.memory_providers ?? [];
  const allMAS = (cfnConfig.workspaces ?? []).flatMap((w) => w.multi_agentic_systems ?? []);
  const enabledCEs = cognitionEngines.filter((ce) => ce.enabled).length;

  const labelClass = dtLabel;
  const metadataLabelClass = dtMetaLabel;
  const metadataValueClass = dtMetaValue;

  return (
    <BasePage
      title={cfn?.name || 'CFN Details'}
      description="View details about your Cognition Fabric Node"
      customDescription={
        cfn && (
          <div className="flex items-center gap-2">
            <Badge variant={cfn.status === 'online' ? 'success' : 'inactive'}>{cfn.status === 'online' ? 'Online' : 'Offline'}</Badge>
            <Badge variant={cfn.enabled ? 'info' : 'inactive'}>{cfn.enabled ? 'Enabled' : 'Disabled'}</Badge>
          </div>
        )
      }
      useBreadcrumbs
      breadcrumbs={crumbs}
      callToAction={
        cfn && (
          <DetailsPageActions
            onEdit={() => setIsEditMode(true)}
            isEditMode={isEditMode}
            onSave={form.handleSubmit(handleSave)}
            onCancelEdit={handleCancelEdit}
            isSaving={form.formState.isSubmitting}
          />
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
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
            <div className="grid grid-cols-4 gap-8">
              <StatCard
                icon={<BrainCircuit size={14} className="text-[hsl(var(--sidebar-icon-active))]" />}
                label="Cognition Engines"
                value={cognitionEngines.length}
                sublabel={`${enabledCEs} enabled${cognitionEngines.length - enabledCEs > 0 ? `, ${cognitionEngines.length - enabledCEs} disabled` : ''}`}
              />
              <StatCard
                icon={<Workflow size={14} className="text-[hsl(var(--sidebar-icon-active))]" />}
                label="Multi-Agentic Systems"
                value={allMAS.length}
                sublabel={allMAS.length > 0 ? `${allMAS.reduce((acc, m) => acc + (m.agents?.length ?? 0), 0)} agents total` : undefined}
              />
              <StatCard
                icon={<HardDrive size={14} className="text-[hsl(var(--sidebar-icon-active))]" />}
                label="Memory Providers"
                value={memoryProviders.length}
                sublabel={memoryProviders.length > 0 ? `${memoryProviders.filter((m) => m.enabled).length} enabled` : undefined}
              />
              {cfnConfig.config_version !== undefined && (
                <StatCard
                  icon={<Settings2 size={14} className="text-[hsl(var(--sidebar-icon-active))]" />}
                  label="Config Version"
                  value={`v${cfnConfig.config_version}`}
                />
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-8">
                <div className="bg-card border border-border rounded-lg py-10 px-5">
                  <span className={labelClass}>Name</span>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="name"
                      render={({field}) => (
                        <FormItem className="space-y-1 mt-2">
                          <FormControl>
                            <Input {...field} className="h-8 text-sm" maxLength={100} autoComplete="off" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <p className="text-2xl font-semibold text-foreground mt-2">{cfn?.name || '-'}</p>
                  )}
                </div>

                <div className="bg-card border border-border rounded-lg py-10 px-5 min-w-0">
                  <span className={labelClass}>ID</span>
                  <div className="mt-2">
                    <CopyableInput value={cfn?.id || ''} />
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg py-10 px-5">
                  <span className={labelClass}>IP Address</span>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="ip_address"
                      render={({field}) => (
                        <FormItem className="space-y-1 mt-2">
                          <FormControl>
                            <Input {...field} className="h-8 text-sm font-mono" placeholder="192.168.1.100" autoComplete="off" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <p className="text-2xl font-semibold text-foreground font-mono mt-2">{cfn?.ip_address || '-'}</p>
                  )}
                </div>

                <div className="bg-card border border-border rounded-lg py-10 px-5">
                  <span className={labelClass}>Port</span>
                  {isEditMode ? (
                    <FormField
                      control={form.control}
                      name="port"
                      render={({field}) => (
                        <FormItem className="space-y-1 mt-2">
                          <FormControl>
                            <Input {...field} type="number" className="h-8 text-sm font-mono" placeholder="8080" autoComplete="off" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <p className="text-2xl font-semibold text-foreground font-mono mt-2">{cfn?.port ? String(cfn.port) : '-'}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-x-8 px-1 pt-1">
                {cfn?.created_at && (
                  <div className="flex flex-col gap-0.5">
                    <span className={metadataLabelClass}>Created</span>
                    <span className={metadataValueClass}>{new Date(cfn.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
                  </div>
                )}
                {cfn?.last_seen && (
                  <div className="flex flex-col gap-0.5">
                    <span className={metadataLabelClass}>Last Seen</span>
                    <span className={metadataValueClass}>{new Date(cfn.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
                  </div>
                )}
                {cfn?.updated_at && (
                  <div className="flex flex-col gap-0.5">
                    <span className={metadataLabelClass}>Last Modified</span>
                    <span className={metadataValueClass}>{new Date(cfn.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded overflow-hidden">
              <div className={dtPanelHeaderInteractive} onClick={() => setCeExpanded((v) => !v)}>
                <div className="flex items-center gap-2">
                  <BrainCircuit size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                  <span className={dtSectionHeader}>Cognition Engines</span>
                  {cognitionEngines.length > 0 && (
                    <Badge variant="accent" className="rounded px-1.5">
                      {cognitionEngines.length}
                    </Badge>
                  )}
                </div>
                {ceExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
              </div>
              {ceExpanded && cognitionEngines.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Subkind</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cognitionEngines.map((ce) => (
                      <TableRow key={ce.id}>
                        <TableCell>{ce.name}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{ce.kind || '-'}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{ce.subkind || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={ce.status === 'online' ? 'success' : 'inactive'}>{ce.status === 'online' ? 'Online' : 'Offline'}</Badge>
                        </TableCell>
                        <TableCell>{ce.enabled ? <Badge variant="info">Enabled</Badge> : <Badge variant="inactive">Disabled</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : ceExpanded ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">No Cognition Engines registered.</p>
              ) : null}
            </div>

            <div className="bg-card border border-border rounded overflow-hidden">
              <div className={dtPanelHeaderInteractive} onClick={() => setMasExpanded((v) => !v)}>
                <div className="flex items-center gap-2">
                  <Workflow size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                  <span className={dtSectionHeader}>Multi-Agentic Systems</span>
                  {allMAS.length > 0 && (
                    <Badge variant="accent" className="rounded px-1.5">
                      {allMAS.length}
                    </Badge>
                  )}
                </div>
                {masExpanded ? (
                  <ChevronUp size={13} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={13} className="text-muted-foreground" />
                )}
              </div>
              {masExpanded && allMAS.length > 0 ? (
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
                        <TableCell>{mas.name}</TableCell>
                        <TableCell className="text-muted-foreground">{mas.agents?.length ?? 0}</TableCell>
                        <TableCell className="text-muted-foreground">{mas.shared_memory?.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{mas.cognition_engines?.length ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : masExpanded ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">No Multi-Agentic Systems found.</p>
              ) : null}
            </div>

            <div className="bg-card border border-border rounded overflow-hidden">
              <div className={dtPanelHeaderInteractive} onClick={() => setMpExpanded((v) => !v)}>
                <div className="flex items-center gap-2">
                  <HardDrive size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
                  <span className={dtSectionHeader}>Memory Providers</span>
                  {memoryProviders.length > 0 && (
                    <Badge variant="accent" className="rounded px-1.5">
                      {memoryProviders.length}
                    </Badge>
                  )}
                </div>
                {mpExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
              </div>
              {mpExpanded && memoryProviders.length > 0 ? (
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
                        <TableCell>{mp.name}</TableCell>
                        <TableCell>{mp.enabled ? <Badge variant="info">Enabled</Badge> : <Badge variant="inactive">Disabled</Badge>}</TableCell>
                        <TableCell className="text-muted-foreground">{mp.description || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : mpExpanded ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">No memory providers registered.</p>
              ) : null}
            </div>
          </form>
        </Form>
      </ConditionalSWRRenderer>
    </BasePage>
  );
}
