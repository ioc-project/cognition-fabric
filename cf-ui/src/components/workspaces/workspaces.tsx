'use client';

import {useState, useEffect} from 'react';
import {Plus, MoreVertical, Trash2, Boxes, AlertCircle, FolderOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {ListShell} from '@/components/ui/list-shell';
import {Loading} from '@/components/ui/loading';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {CreateWorkspaceDialog} from './create-workspace-dialog';
import {workspaceApi} from '@/api';
import {useRouter, useSearchParams} from 'next/navigation';
import {parseError} from '@/lib/utils';
import {useWorkspaces} from '@/hooks/useApi';

export function Workspaces() {
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
    if (!deleteConfirm.workspaceId) return;

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

  if (workspaces.length === 0) {
    return (
      <>
        <div className="fixed inset-0 left-64 top-16 flex items-center justify-center px-8">
          <ListShell
            title="Workspaces"
            description="Organize your TKF resources into logical spaces"
            actionLabel="Create Your First Workspace"
            onAction={() => setIsCreateDialogOpen(true)}
            empty={{
              icon: Boxes,
              title: 'No workspaces yet',
              description: 'Create a workspace to organize your TKF resources - Multi-Agentic Systems, Knowledge Adapters, and Reasoners.',
              actionLabel: 'Create Your First Workspace',
              onAction: () => setIsCreateDialogOpen(true)
            }}
          />
        </div>

        <CreateWorkspaceDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSuccess={handleWorkspaceCreated} />
      </>
    );
  }

  return (
    <div className="space-y-6 px-8 pt-4 relative z-0">
      <div className="w-full">
        <div className="flex items-center justify-between">
          <div className="flex flex-col justify-center items-start gap-1">
            <h1 className="page-title-text">Workspaces</h1>
            <p className="page-title-description">Organize your TKF resources into logical spaces</p>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            variant="outline"
            className="gap-2 border-border hover:bg-accent/50 transition-colors"
            size="default"
          >
            <Plus className="w-4 h-4" />
            Create Workspace
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" dismissible onDismiss={() => setError(null)}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="w-full">
        <div className="list-grid">
          {workspaces.map((workspace) => (
            <Card
              key={workspace.id}
              variant="list"
              className="cursor-pointer hover:shadow-md transition-shadow duration-200"
              onClick={() => handleEditWorkspace(workspace.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="rounded-lg bg-[hsl(var(--accent))] w-12 h-12 flex items-center justify-center mb-4">
                    <FolderOpen className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-gray-900 dark:text-white mb-1 leading-6 truncate pr-12">{workspace.name}</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm leading-5 whitespace-nowrap overflow-hidden text-ellipsis pr-12">
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
      </div>

      <CreateWorkspaceDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSuccess={handleWorkspaceCreated} />

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({open, workspaceId: null, workspaceName: ''})}
        onConfirm={handleDeleteWorkspace}
        title="Delete Workspace"
        description={`Are you sure you want to delete "${deleteConfirm.workspaceName}"? This action cannot be undone and will remove all associated resources.`}
        confirmText="Delete Workspace"
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
