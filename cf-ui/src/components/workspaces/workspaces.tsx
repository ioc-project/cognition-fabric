'use client';

import {useState, useEffect} from 'react';
import {Plus, MoreVertical, Trash2, Boxes, AlertCircle, FolderOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
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

  // Set error from SWR
  useEffect(() => {
    if (swrError) {
      setError(swrError);
    }
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
    } catch (error) {
      const errorMessage = parseError(error);
      setError(`Failed to delete workspace: ${errorMessage}`);
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
        <div className="fixed inset-0 left-64 top-16 flex items-center justify-center">
          <EmptyState
            icon={Boxes}
            title="No workspaces yet"
            description="Create a workspace to organize your TKF resources - Multi-Agentic Systems, Knowledge Adapters, and Reasoners."
            actionLabel="Create Your First Workspace"
            onAction={() => setIsCreateDialogOpen(true)}
          />
        </div>

        <CreateWorkspaceDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSuccess={handleWorkspaceCreated} />
      </>
    );
  }

  return (
    <div className="space-y-6 px-12 pt-4 relative z-0">
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

      {error && (
        <Alert variant="destructive" dismissible onDismiss={() => setError(null)}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {workspaces.map((workspace) => (
          <Card
            key={workspace.id}
            className="py-2 px-4 hover:shadow-lg transition-shadow cursor-pointer flex items-start gap-4"
            onClick={() => handleEditWorkspace(workspace.id)}
          >
            <div className="flex items-start justify-between gap-4 w-full">
              <div className="flex items-start gap-4">
                <div className="pt-0.5">
                  <FolderOpen className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="card-title mb-1">{workspace.name}</h3>
                  <p className="card-info text-muted-foreground">
                    {workspace.mas_count || 0} MAS • {workspace.kep_count || 0} KEPs • {workspace.users?.length || 0} Users
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
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
