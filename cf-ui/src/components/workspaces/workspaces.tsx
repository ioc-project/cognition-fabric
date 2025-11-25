'use client';

import {useState, useEffect} from 'react';
import {Plus, Users, Key, MoreVertical, Trash2, Edit, Boxes, Calendar, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {EmptyState} from '@/components/ui/empty-state';
import {Loading} from '@/components/ui/loading';
import {StatCard} from '@/components/ui/stat-card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {CreateWorkspaceDialog} from './create-workspace-dialog';
import {workspaceApi} from '@/api';
import {useRouter, useSearchParams} from 'next/navigation';
import {parseError, safeGetDate} from '@/lib/utils';
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
            description="Create a workspace to organize your team, manage API keys, and configure data sources for your knowledge graphs and agent systems."
            actionLabel="Create Your First Workspace"
            onAction={() => setIsCreateDialogOpen(true)}
          />
        </div>

        <CreateWorkspaceDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSuccess={handleWorkspaceCreated} />
      </>
    );
  }

  const totalUsers = workspaces.reduce((sum, ws) => sum + (ws.users?.length || 0), 0);
  const totalApiKeys = workspaces.reduce((sum, ws) => sum + (ws.api_keys?.length || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Workspaces</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your workspaces and team collaboration</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Workspace
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" dismissible onDismiss={() => setError(null)} className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <StatCard label="Total Workspaces" value={workspaces.length} />
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="Active API Keys" value={totalApiKeys} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Workspaces</CardTitle>
          <CardDescription>View and manage all your workspaces</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => handleEditWorkspace(workspace.id)}
              >
                <div className="flex-1">
                  <h3 className="font-semibold dark:text-white mb-1">{workspace.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      <span>{workspace.users?.length || 0} users</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Key className="w-4 h-4" />
                      <span>{workspace.api_keys?.length || 0} API keys</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>{safeGetDate(workspace.created_at)?.toLocaleDateString() || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditWorkspace(workspace.id);
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteConfirm(workspace.id, workspace.name);
                      }}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <CreateWorkspaceDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSuccess={handleWorkspaceCreated} />

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({open, workspaceId: null, workspaceName: ''})}
        onConfirm={handleDeleteWorkspace}
        title="Delete Workspace"
        description={`Are you sure you want to delete "${deleteConfirm.workspaceName}"? This action cannot be undone and will remove all associated users and API keys.`}
        confirmText="Delete Workspace"
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
