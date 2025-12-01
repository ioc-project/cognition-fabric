'use client';

import {useParams, useRouter} from 'next/navigation';
import {ArrowLeft, AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Loading} from '@/components/ui/loading';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {EmptyState} from '@/components/ui/empty-state';
import {useWorkspace, useUsers, useApiKeys} from '@/hooks/useApi';

export function WorkspaceDetails() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const {workspace, isLoading: workspaceLoading} = useWorkspace(workspaceId);
  const {isLoading: usersLoading, error: usersError} = useUsers(workspaceId);
  const {isLoading: keysLoading, error: keysError} = useApiKeys(workspaceId);

  const loading = workspaceLoading || usersLoading || keysLoading;
  const error = usersError || keysError;

  if (loading) {
    return <Loading />;
  }

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-gray-600 dark:text-gray-400 mb-4">Workspace not found</div>
        <Button onClick={() => router.push('/workspaces')}>Back to Workspaces</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-row justify-between items-center mb-6">
        <div className="flex flex-col justify-center items-start gap-1">
          <h1 className="page-title-text">{workspace.name}</h1>
          <p className="page-title-description">Workspace Context: scope for MAS, Adapters, Reasoners, and Queries</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border border-[#187ADC] rounded text-[#3C4551] px-4 py-1.5 h-8">
            <span className="font-semibold text-sm"> {workspace.id.slice(0, 8)}...</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-600">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Simplified workspace details per design: only MAS section */}
      {(workspace.mas_count ?? 0) === 0 ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <EmptyState
            icon={ArrowLeft}
            title="Register a Multi‑Agent System to get started"
            description="A MAS is required before adding Knowledge Adapters or Reasoners in this workspace."
            actionLabel="Register MAS"
            onAction={() => router.push(`/workspaces/${workspaceId}/mas?create=true`)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-card">
            <h2 className="text-base font-medium mb-2">Multi‑Agent Systems</h2>
            <p className="text-sm text-muted-foreground mb-4">Registered MAS for this workspace.</p>
            <div className="text-sm text-muted-foreground">MAS list will appear here.</div>
          </div>
          <div className="flex gap-3">
            <Button size="sm" variant="outline" onClick={() => router.push(`/workspaces/${workspaceId}/mas?create=true`)}>
              Register MAS
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
