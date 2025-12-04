'use client';

import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';

export default function KnowledgeAdaptersList() {
  const params = useParams();
  const workspaceId = params.id as string;
  return (
    <div className="px-12 pt-4">
      <BasePage title="Knowledge Adapters">
        <div className="card-info text-muted-foreground">Todo: Knowledge Adapters List.</div>
      </BasePage>
    </div>
  );
}
