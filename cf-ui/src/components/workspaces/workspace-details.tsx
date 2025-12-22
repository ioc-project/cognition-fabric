'use client';

import Link from 'next/link';
import {Boxes} from 'lucide-react';
import {useMemo} from 'react';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {EmptyState} from '@/components/ui/empty-state';
import {BasePage} from '@/components/ui/base-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {routes, breadcrumbs} from '@/constants/routes';
import {masApi, kepApi, reasonerApi} from '@/api/endpoints';
import useSWR from 'swr';
import type {MAS} from '@/api/types/mas';
import type {KEP} from '@/api/types/kep';
import type {Reasoner} from '@/api/types/reasoner';

export function WorkspaceDetails() {
  const {workspaceId, workspace, isLoading: workspaceLoading} = useCurrentWorkspace();

  const {data: masList = [] as MAS[]} = useSWR<MAS[]>(workspaceId ? ['mas-list', workspaceId] : null, () => masApi.list(workspaceId!));
  const {data: kepList = [] as KEP[]} = useSWR<KEP[]>(workspaceId ? ['kep-list', workspaceId] : null, () => kepApi.list(workspaceId!));
  const {data: reasonersList = [] as Reasoner[]} = useSWR<Reasoner[]>(workspaceId ? ['reasoners', workspaceId] : null, () =>
    reasonerApi.list(workspaceId!)
  );

  const loading = workspaceLoading;
  const error = null;

  const workspaceName: string = String(workspace?.name ?? (workspaceId ? `Workspace ${workspaceId.slice(0, 8)}` : 'Workspace'));

  const latestMas = useMemo(() => {
    return [...masList]
      .sort((a, b) => {
        if (!a.created_at && !b.created_at) {
          return 0;
        }
        if (!a.created_at) {
          return 1;
        }
        if (!b.created_at) {
          return -1;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 4);
  }, [masList]);

  const latestKeps = useMemo(() => {
    return [...kepList]
      .sort((a, b) => {
        if (!a.created_at && !b.created_at) {
          return 0;
        }
        if (!a.created_at) {
          return 1;
        }
        if (!b.created_at) {
          return -1;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 4);
  }, [kepList]);

  const latestReasoners = useMemo(() => {
    return [...reasonersList]
      .sort((a, b) => {
        if (!a.created_at && !b.created_at) {
          return 0;
        }
        if (!a.created_at) {
          return 1;
        }
        if (!b.created_at) {
          return -1;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 4);
  }, [reasonersList]);

  return (
    <BasePage title={workspaceName} useBreadcrumbs breadcrumbs={breadcrumbs.workspaceDetails(workspaceName)}>
      <ConditionalSWRRenderer
        data={workspace}
        error={error}
        customIsLoading={loading}
        itemName="Workspace"
        customEmptyComponent={
          <div className="px-8 pt-16 max-w-4xl mx-auto">
            <EmptyState
              icon={Boxes}
              title="Workspace not found"
              description="The requested workspace could not be found."
              actionLabel="Back to Workspaces"
              href={routes.workspaces.list}
            />
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <div className="p-4 border rounded-lg bg-card soft-card">
            <div className="flex flex-col gap-6">
              <h4 className="card-title">Multi‑Agentic Systems (MAS)</h4>
              <p className="card-stats">{masList.length}</p>
            </div>
          </div>
          <div className="p-4 border rounded-lg bg-card soft-card">
            <div className="flex flex-col gap-6">
              <h4 className="card-title">Knowledge Adapters</h4>
              <p className="card-stats">{kepList.length}</p>
            </div>
          </div>
          <div className="p-4 border rounded-lg bg-card soft-card">
            <div className="flex flex-col gap-6">
              <h4 className="card-title">Reasoners</h4>
              <p className="card-stats">{reasonersList.length}</p>
            </div>
          </div>
        </div>

        {masList.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <EmptyState
              icon={Boxes}
              title="No Multi‑Agentic Systems found."
              description="Create a MAS to link adapters, add reasoners, and run queries."
              actionLabel="Create Multi‑Agent Systems"
              href={routes.workspaces.mas.create(workspaceId!)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 border rounded-lg bg-card soft-card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-medium">Latest Multi-Agentic Systems (MAS)</h2>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="sidebar">
                    <Link href={routes.workspaces.mas.list(workspaceId!)}>View All</Link>
                  </Button>
                  <Button asChild size="sm" variant="sidebar">
                    <Link href={routes.workspaces.mas.create(workspaceId!)}>Create</Link>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                {latestMas.map((mas) => (
                  <div key={mas.id} className="p-4 border rounded-lg bg-background/50 hover:bg-background/80 transition-colors h-full">
                    <div className="flex flex-col h-full">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-foreground mb-2">{mas.name}</h3>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{mas.created_at ? new Date(mas.created_at).toLocaleDateString() : 'Unknown date'}</span>
                        {mas.agents && Object.keys(mas.agents).length > 0 && (
                          <span>
                            {Object.keys(mas.agents).length} agent
                            {Object.keys(mas.agents).length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {kepList.length > 0 && (
              <div className="p-6 border rounded-lg bg-card soft-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-base font-medium">Latest Knowledge Adapters</h2>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="sidebar">
                      <Link href={routes.workspaces.knowledge.list(workspaceId!)}>View All</Link>
                    </Button>
                    <Button asChild size="sm" variant="sidebar">
                      <Link href={routes.workspaces.knowledge.create(workspaceId!)}>Create</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                  {latestKeps.map((kep) => (
                    <div key={kep.id} className="p-4 border rounded-lg bg-background/50 hover:bg-background/80 transition-colors h-full">
                      <div className="flex flex-col h-full">
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-foreground mb-2">{kep.name}</h3>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{kep.created_at ? new Date(kep.created_at).toLocaleDateString() : 'Unknown date'}</span>
                          <span>{kep.mas_ids.length} MAS</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reasonersList.length > 0 && (
              <div className="p-6 border rounded-lg bg-card soft-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-base font-medium">Latest Reasoners</h2>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="sidebar">
                      <Link href={routes.workspaces.reasoners.list(workspaceId!)}>View All</Link>
                    </Button>
                    <Button asChild size="sm" variant="sidebar">
                      <Link href={routes.workspaces.reasoners.create(workspaceId!)}>Create</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                  {latestReasoners.map((r) => (
                    <div key={r.id} className="p-4 border rounded-lg bg-background/50 hover:bg-background/80 transition-colors h-full">
                      <div className="flex flex-col h-full">
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-foreground mb-2">{r.name}</h3>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Unknown date'}</span>
                          <span>{r.mas_id ? '1 MAS' : 'No MAS'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ConditionalSWRRenderer>
    </BasePage>
  );
}
