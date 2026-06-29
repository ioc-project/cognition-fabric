// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import {BrainCircuit, Trash2, Pencil} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {EmptyState} from '@/components/ui/empty-state';
import {BasePage} from '@/components/ui/base-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {routes, breadcrumbs} from '@/constants/routes';
import {LoaderRelative} from '@/components/ui/loading';
import {useMAS} from '@/hooks/useMAS';
import {useCfn} from '@/hooks/useCfn';
import {ObjectOptionsDropdown} from '@/components/ui/object-options-dropdown';
import {DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {workspaceApi} from '@/api/endpoints';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {EditWorkspaceDialog} from './edit-workspace-dialog';

export function WorkspaceDetails() {
  const router = useRouter();
  const {workspaceId, workspace, isLoading: workspaceLoading} = useCurrentWorkspace();

  const {masList, isLoading: masLoading} = useMAS(workspaceId || '');
  const {cfns = [], isLoading: cfnLoading} = useCfn();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const loading = workspaceLoading;
  const error = null;

  const workspaceName: string = String(workspace?.name ?? (workspaceId ? `Workspace ${workspaceId.slice(0, 8)}` : 'Workspace'));

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await workspaceApi.delete(data.id);
        toast.success(`Workspace "${data.name}" deleted successfully`);
        router.push(routes.workspaces.list);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

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

  // Get the CFN associated with this workspace
  const workspaceCfn = useMemo(() => {
    if (!workspace?.cfn_id) {
      return null;
    }
    return cfns.find((cfn) => cfn.id === workspace.cfn_id) || null;
  }, [cfns, workspace?.cfn_id]);

  const latestCfns = useMemo(() => {
    return workspaceCfn ? [workspaceCfn] : [];
  }, [workspaceCfn]);

  return (
    <>
      <BasePage
        title={workspaceName}
        useBreadcrumbs
        breadcrumbs={breadcrumbs.workspaceDetails(workspaceName)}
        callToAction={
          workspace &&
          workspaceId && (
            <ObjectOptionsDropdown objectName={workspace.name}>
              <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deleteDialog.open({id: workspaceId, name: workspace.name})}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </ObjectOptionsDropdown>
          )
        }
      >
        <ConditionalSWRRenderer
          data={workspace}
          error={error}
          customIsLoading={loading}
          itemName="Workspace"
          customEmptyComponent={
            <div className="px-8 pt-16 max-w-4xl mx-auto">
              <EmptyState
                icon={BrainCircuit}
                title="Workspace not found"
                description="The requested workspace could not be found."
                actionLabel="Back to Workspaces"
                href={routes.workspaces.list}
              />
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="p-4 border rounded-lg bg-card soft-card">
              <div className="flex flex-col gap-6">
                <h4 className="card-title">Multi‑Agentic Systems (MAS)</h4>
                <p className="card-stats">{masList.length}</p>
              </div>
            </div>
            <div className="p-4 border rounded-lg bg-card soft-card">
              <div className="flex flex-col gap-6">
                <h4 className="card-title">Cognition Fabric Nodes</h4>
                <p className="card-stats">{workspace?.cfn_id ? 1 : 0}</p>
              </div>
            </div>
          </div>

          {masLoading && masList.length === 0 ? (
            <div className="p-6 border rounded-lg bg-card soft-card">
              <LoaderRelative />
            </div>
          ) : masList.length === 0 ? (
            <div className="p-6 border rounded-lg bg-card soft-card">
              <EmptyState
                icon={BrainCircuit}
                title="No Multi‑Agentic Systems found."
                description="Create a multi-agent system to get started."
                actionLabel="Create Multi‑Agent Systems"
                href={routes.workspaces.mas.create(workspaceId!)}
                variant="inset"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-6 border rounded-lg bg-card soft-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-base font-medium">Latest Multi-Agentic Systems</h2>
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

              {cfnLoading && !workspaceCfn && workspace?.cfn_id ? (
                <div className="p-6 border rounded-lg bg-card soft-card">
                  <LoaderRelative />
                </div>
              ) : (
                workspaceCfn && (
                  <div className="p-6 border rounded-lg bg-card soft-card">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-base font-medium">Cognition Fabric Node</h2>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="sidebar">
                          <Link href={routes.cfn.list}>View All</Link>
                        </Button>
                        <Button asChild size="sm" variant="sidebar">
                          <Link href={routes.cfn.create}>Create</Link>
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                      {latestCfns.map((cfn) => (
                        <div key={cfn.id} className="p-4 border rounded-lg bg-background/50 hover:bg-background/80 transition-colors h-full">
                          <div className="flex flex-col h-full">
                            <div className="flex-1">
                              <h3 className="text-sm font-medium text-foreground mb-2">{cfn.name}</h3>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{cfn.created_at ? new Date(cfn.created_at).toLocaleDateString() : 'Unknown date'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </ConditionalSWRRenderer>
      </BasePage>
      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.close}
        onConfirm={handleDelete}
        title="Delete Workspace"
        description={
          deleteError ??
          `Are you sure you want to delete "${deleteDialog.data?.name}"? This action cannot be undone and will delete all associated data.`
        }
        confirmText="Delete"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
      {workspace && <EditWorkspaceDialog workspace={workspace} open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} />}
    </>
  );
}
