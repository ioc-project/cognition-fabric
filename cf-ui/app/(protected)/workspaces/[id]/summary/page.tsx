'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';

export default function WorkspaceSummaryPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <BasePage title="Summary" description="Detailed metrics and analytics for this workspace">
        {/* TODO: GET /api/workspaces/{id}/summary */}
        <div className="card-info text-muted-foreground">TODO: Summary view for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
