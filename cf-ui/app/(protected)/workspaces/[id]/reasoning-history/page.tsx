'use client';

import {useParams} from 'next/navigation';
import {ReasoningHistoryList} from '@/components/reasoning-history/reasoning-history-list';

export default function WorkspaceReasoningHistoryPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return <ReasoningHistoryList workspaceId={workspaceId} />;
}
