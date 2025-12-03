'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';

export default function MASList() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <BasePage title="Multi-Agent Systems" description="Manage registered Multi-Agent Systems in this workspace">
        <div className="card-info text-muted-foreground">Todo: MAS list for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
