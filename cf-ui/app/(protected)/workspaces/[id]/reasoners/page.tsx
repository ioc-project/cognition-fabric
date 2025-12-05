'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';

export default function ReasonersList() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <BasePage title="Reasoners" description="Manage Reasoners in this workspace">
        <div className="card-info text-muted-foreground">TODO: Reasoners list for workspace {workspaceId}.</div>
      </BasePage>
    </div>
  );
}
