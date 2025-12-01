'use client';

import {useParams} from 'next/navigation';

export default function WorkspaceSummaryPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <div className="flex flex-col justify-center items-start gap-1 mb-6">
        <h1 className="page-title-text">Summary</h1>
        <p className="page-title-description">Detailed metrics and analytics for this workspace</p>
      </div>
      {/* TODO: GET /api/workspaces/{id}/summary */}
      <div className="card-info text-muted-foreground">Summary view coming soon for workspace {workspaceId}.</div>
    </div>
  );
}
