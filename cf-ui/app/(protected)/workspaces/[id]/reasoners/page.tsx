'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function ReasonersList() {
  const params = useParams();
  const id = params.id as string;
  const {workspace} = useCurrentWorkspace();
  const name: string = workspace?.name ?? 'Workspace';

  return (
    <div className="px-12 pt-4">
      <BasePage
        title="Reasoners"
        description="Manage Reasoners in this workspace"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.workspaceReasoners(id, name)}
      >
        <div className="card-info text-muted-foreground">TODO: Reasoners list for workspace {id}.</div>
      </BasePage>
    </div>
  );
}
