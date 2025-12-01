'use client';

import {useParams} from 'next/navigation';

export default function WorkspaceOverviewPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <div className="flex flex-col justify-center items-start gap-1 mb-6">
        <h1 className="page-title-text">Overview</h1>
        <p className="page-title-description">At-a-glance view of MAS, Adapters, and Reasoners</p>
      </div>
      {/* TODO: When ready, show counts and recent events using summary endpoint */}
      <div className="card-info text-muted-foreground">Overview coming soon for workspace {workspaceId}.</div>
    </div>
  );
}
