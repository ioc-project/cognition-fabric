'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function WorkspaceSummaryPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const {workspace} = useCurrentWorkspace();

  return (
    <div className="px-12 pt-4">
      <BasePage title="Summary" useBreadcrumbs breadcrumbs={breadcrumbs.workspaceSummary(workspaceId, workspace?.name || 'Workspace')}>
        {/* TODO: GET /api/workspaces/{id}/summary */}
        <div className="card-info text-muted-foreground">TODO: Summary view for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
