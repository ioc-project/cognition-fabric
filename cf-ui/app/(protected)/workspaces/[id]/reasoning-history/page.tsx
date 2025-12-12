'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function WorkspaceReasoningHistory() {
  const params = useParams();
  const id = params.id as string;
  const {workspace} = useCurrentWorkspace();
  const name: string = workspace?.name ?? 'Workspace';

  return (
    <div className="px-12 pt-4">
      <BasePage title="Reasoning History" useBreadcrumbs breadcrumbs={breadcrumbs.workspaceReasoningHistory(id, name)}>
        <div className="card-info text-muted-foreground">TODO: Reasoning history for workspace {id}.</div>
      </BasePage>
    </div>
  );
}
