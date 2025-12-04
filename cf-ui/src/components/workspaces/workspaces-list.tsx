'use client';

import {useState, useEffect} from 'react';
import {Plus, MoreVertical, Trash2, AlertCircle, FolderOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {ListShell} from '@/components/ui/list-shell';
import {Loading} from '@/components/ui/loading';
import {BasePage} from '@/components/ui/base-page';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {CreateWorkspaceDialog} from './create-workspace-dialog';
import {workspaceApi} from '@/api/endpoints';
import {useRouter, useSearchParams} from 'next/navigation';
import {parseError} from '@/lib/utils';
import {useWorkspaces} from '@/hooks/useApi';
import type {Workspace} from '@/api/types';

export function WorkspacesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const {workspaces, isLoading: loading, error: swrError, mutate} = useWorkspaces();
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{open: boolean; workspaceId: string | null; workspaceName: string}>({
    open: false,
    workspaceId: null,
    workspaceName: ''
  });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setIsCreateDialogOpen(true);
    }
  }, [searchParams]);
  useEffect(() => {
    setError(swrError ?? null);
  }, [swrError]);

  const handleWorkspaceCreated = (workspaceId: string) => {
    router.push(`/workspaces/${workspaceId}`);
  };

  const handleDeleteWorkspace = async () => {
    if (!deleteConfirm.workspaceId) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await workspaceApi.delete(deleteConfirm.workspaceId);
      await mutate();
      setDeleteConfirm({open: false, workspaceId: null, workspaceName: ''});
    } catch (err) {
      setError(`Failed to delete workspace: ${parseError(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteConfirm = (workspaceId: string, workspaceName: string) => {
    setDeleteConfirm({open: true, workspaceId, workspaceName});
  };

  const handleEditWorkspace = (workspaceId: string) => {
    router.push(`/workspaces/${workspaceId}`);
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      {workspaces.length === 0 ? (
        <div className="fixed inset-0 left-64 top-16 flex items-center justify-center px-8">
          <ListShell
            empty={{
              icon: FolderOpen,
              title: 'No workspaces',
              description: 'Create a workspace to organize your TKF resources - Multi-Agentic Systems, Knowledge Adapters, and Reasoners.',
              actionLabel: 'Create Your First Workspace',
              onAction: () => setIsCreateDialogOpen(true)
            }}
          />
        </div>
      ) : (
        <div className="space-y-8 px-8 pt-4 relative z-0">
          <BasePage
            title="Workspaces"
            callToAction={
              <Button onClick={() => setIsCreateDialogOpen(true)} variant="sidebar" className="gap-2" size="default">
                <Plus className="w-4 h-4" />
                Create Workspace
              </Button>
            }
          >
            {error && (
              <Alert variant="destructive" dismissible onDismiss={() => setError(null)}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="list-grid">
              {workspaces.map((workspace: Workspace) => (
                <Card
                  key={workspace.id}
                  variant="list"
                  className="cursor-pointer hover:shadow-md transition-shadow duration-200"
                  onClick={() => handleEditWorkspace(workspace.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="rounded-lg bg-[hsl(var(--accent))] w-12 h-12 flex items-center justify-center mb-4">
                        <FolderOpen className="w-5 h-5 text-card-foreground" />
                      </div>
                      <h4 className="card-title truncate pr-12">{workspace.name}</h4>
                      <p className="card-info mt-1 whitespace-nowrap overflow-hidden text-ellipsis pr-12">
                        {workspace.mas_count || 0} MAS · {workspace.kep_count || 0} KEPs · {workspace.users?.length || 0}{' '}
                        {(workspace.users?.length || 0) === 1 ? 'User' : 'Users'}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 z-10">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteConfirm(workspace.id, workspace.name);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              ))}
            </div>
          </BasePage>
        </div>
      )}

      <CreateWorkspaceDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSuccess={handleWorkspaceCreated} />

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({open, workspaceId: null, workspaceName: ''})}
        onConfirm={handleDeleteWorkspace}
        title={`Delete ${deleteConfirm.workspaceName || 'Workspace'}`}
        description={`Delete "${deleteConfirm.workspaceName}"? This action is permanent and cannot be undone.`}
        confirmText="Delete Workspace"
        variant="destructive"
        loading={deleting}
      />
    </>
  );
}
