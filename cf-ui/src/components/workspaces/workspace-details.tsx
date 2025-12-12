'use client';

import {useRouter} from 'next/navigation';
import {Boxes, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Loading} from '@/components/ui/loading';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {EmptyState} from '@/components/ui/empty-state';
import {BasePage} from '@/components/ui/base-page';
import {useUsers} from '@/hooks/useApi';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {routes, breadcrumbs} from '@/constants/routes';

export function WorkspaceDetails() {
  const router = useRouter();
  const {workspaceId, workspace, isLoading: workspaceLoading} = useCurrentWorkspace();

  const {isLoading: usersLoading, error: usersError} = useUsers(workspaceId || '');

  const loading = workspaceLoading || usersLoading;
  const error = usersError || null;

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
          onAction={() => router.push(routes.workspaces.list)}
        />
      </div>
    );
  }

  const workspaceName: string = workspace.name;

  return (
    <BasePage title={workspace.name} useBreadcrumbs breadcrumbs={breadcrumbs.workspaceDetails(workspaceName)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="p-4 border rounded-lg bg-card soft-card">
          <div className="flex flex-col gap-6">
            <h4 className="card-title">Multi‑Agent Systems</h4>
            <p className="card-stats">{workspace.mas_count ?? 0}</p>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card soft-card">
          <div className="flex flex-col gap-6">
            <h4 className="card-title">Knowledge Adapters</h4>
            <p className="card-stats">{workspace.kep_count ?? 0}</p>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card soft-card">
          <div className="flex flex-col gap-6">
            <h4 className="card-title">Reasoners</h4>
            <p className="card-stats">{workspace.reasoner_count ?? 0}</p>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card soft-card">
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
              description="Create a Multi-Agent System to link adapters, add reasoners, and run queries."
              actionLabel="Create Multi‑Agent System"
              onAction={() => router.push(routes.workspaces.mas.create(workspaceId!))}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-card soft-card">
            <h2 className="text-base font-medium mb-2">Multi‑Agent Systems</h2>
            <p className="text-sm text-muted-foreground mb-4">Registered Multi-Agent Systems for this workspace.</p>
            <div className="text-sm text-muted-foreground">Multi-Agent Systems list will appear here.</div>
          </div>
          <div className="flex gap-3">
            <Button size="sm" variant="outline" onClick={() => router.push(routes.workspaces.mas.create(workspaceId!))}>
              Create Multi-Agent System
            </Button>
          </div>
        </div>
      )}
    </BasePage>
  );
}
