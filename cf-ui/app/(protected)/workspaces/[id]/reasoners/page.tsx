'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function ReasonersList() {
  const params = useParams();
  const workspaceId = params.id as string;
  const {workspace} = useCurrentWorkspace();

  return (
    <div className="px-12 pt-4">
      <BasePage
        title="Reasoners"
        description="Manage Reasoners in this workspace"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.workspaceReasoners(workspaceId, workspace?.name || 'Workspace')}
      >
        <div className="card-info text-muted-foreground">TODO: Reasoners list for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
