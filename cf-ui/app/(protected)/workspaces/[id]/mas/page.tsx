'use client';

import {useParams} from 'next/navigation';

export default function WorkspaceMasPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <div className="flex flex-col justify-center items-start gap-1 mb-6">
        <h1 className="page-title-text">Multi-Agent Systems (MAS)</h1>
        <p className="page-title-description">Manage MAS registered under this workspace</p>
      </div>
      {/* TODO: MAS list for workspaceId */}
      <div className="card-info text-muted-foreground">MAS list coming soon for workspace {workspaceId}.</div>
    </div>
  );
}
