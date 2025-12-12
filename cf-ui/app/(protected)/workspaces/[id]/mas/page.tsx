'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function MASList() {
  const params = useParams();
  const workspaceId = params.id as string;
  const {workspace} = useCurrentWorkspace();
  const name: string = workspace?.name ?? 'Workspace';

  return (
    <div className="px-12 pt-4">
      <BasePage title="Multi-Agent Systems" useBreadcrumbs breadcrumbs={breadcrumbs.workspaceMAS(workspaceId, name)}>
        <div className="card-info text-muted-foreground">Todo: MAS list for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
