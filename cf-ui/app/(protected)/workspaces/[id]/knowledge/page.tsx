'use client';

import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function KnowledgeAdaptersList() {
  const {workspaceId, workspace} = useCurrentWorkspace();

  return (
    <div className="px-12 pt-4">
      <BasePage title="Knowledge Adapters" useBreadcrumbs breadcrumbs={breadcrumbs.workspaceKnowledge(workspaceId!, workspace?.name || 'Workspace')}>
        <div className="card-info text-muted-foreground">Todo: Knowledge Adapters List.</div>
      </BasePage>
    </div>
  );
}
