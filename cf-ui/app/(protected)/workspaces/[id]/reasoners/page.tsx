'use client';

import {useParams} from 'next/navigation';
import {ReasonerList} from '@/components/reasoners/reasoner-list';

export default function ReasonersListPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return (
    <div className="space-y-8 px-8 pt-4">
      <ReasonerList workspaceId={workspaceId} />
    </div>
  );
}
