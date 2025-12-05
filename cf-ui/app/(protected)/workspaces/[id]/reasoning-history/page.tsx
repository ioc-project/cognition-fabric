'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';

export default function WorkspaceReasoningHistory() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <BasePage title="Reasoning History">
        <div className="card-info text-muted-foreground">TODO: Reasoning history for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
