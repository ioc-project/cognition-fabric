'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function WorkspaceReasoningHistory() {
  const params = useParams();
  const workspaceId = params.id as string;
  const {workspace} = useCurrentWorkspace();

  return (
    <div className="px-12 pt-4">
      <BasePage
        title="Reasoning History"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.workspaceReasoningHistory(workspaceId, workspace?.name || 'Workspace')}
      >
        <div className="card-info text-muted-foreground">TODO: Reasoning history for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
