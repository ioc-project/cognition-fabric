'use client';

import {useRouter} from 'next/navigation';
import {Boxes, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Loading} from '@/components/ui/loading';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {EmptyState} from '@/components/ui/empty-state';
import {useUsers, useApiKeys} from '@/hooks/useApi';
import {useLocalStore} from '@/store/useLocalStore';
import {useEffect} from 'react';
import {useWorkspaceContext} from '@/providers/workspace-context';

export function WorkspaceDetails() {
  const router = useRouter();
  const {workspaceId, workspace, isLoading: workspaceLoading} = useWorkspaceContext();
  const {setSelectedWorkspace} = useLocalStore();

  useEffect(() => {
    if (workspace && (workspace as any).id) {
      setSelectedWorkspace((workspace as any).id, (workspace as any).name);
    }
  }, [workspace?.id, workspace?.name, setSelectedWorkspace]);

  const {isLoading: usersLoading, error: usersError} = useUsers(workspaceId || '');
  const {isLoading: keysLoading, error: keysError} = useApiKeys(workspaceId || '');

  const loading = workspaceLoading || usersLoading || keysLoading;
  const error = usersError || keysError;

  if (loading) {
    return <Loading />;
  }

  if (!workspace) {
    return (
      <div className="px-8 pt-16 max-w-4xl mx-auto">
        <EmptyState
          icon={Boxes}
          title="Workspace not found"
          description="The requested workspace could not be found."
          actionLabel="Back to Workspaces"
          onAction={() => router.push('/workspaces')}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-row justify-between items-center mb-8">
        <div className="flex flex-col justify-center items-start gap-1">
          <h1 className="page-title">{workspace.name}</h1>
          <p className="page-description">Workspace Context: scope for MAS, Adapters, Reasoners, and Queries</p>
        </div>

        <div className="flex items-center gap-2" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex flex-col gap-6">
            <h4 className="card-title">Multi‑Agent Systems</h4>
            <p className="card-stats">{workspace.mas_count ?? 0}</p>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex flex-col gap-6">
            <h4 className="card-title">Knowledge Adapters</h4>
            <p className="card-stats">{workspace.kep_count ?? 0}</p>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex flex-col gap-6">
            <h4 className="card-title">Reasoners</h4>
            <p className="card-stats">{workspace.reasoner_count ?? 0}</p>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex flex-col gap-6">
            <h4 className="card-title">Users</h4>
            <p className="card-stats">{workspace.users?.length ?? 0}</p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(workspace.mas_count ?? 0) === 0 ? (
        <div className="space-y-4 mt-12">
          <div className="max-w-4xl mx-auto">
            <EmptyState
              icon={Boxes}
              title="No Multi‑Agent Systems exist in this workspace."
              description="Create a MAS to link adapters, add reasoners, and run queries."
              actionLabel="Create Multi‑Agent System"
              onAction={() => router.push(`/workspaces/${workspaceId}/mas/create`)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-card">
            <h2 className="text-base font-medium mb-2">Multi‑Agent Systems</h2>
            <p className="text-sm text-muted-foreground mb-4">Registered MAS for this workspace.</p>
            <div className="text-sm text-muted-foreground">MAS list will appear here.</div>
          </div>
          <div className="flex gap-3">
            <Button size="sm" variant="outline" onClick={() => router.push(`/workspaces/${workspaceId}/mas/create`)}>
              Create MAS
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
