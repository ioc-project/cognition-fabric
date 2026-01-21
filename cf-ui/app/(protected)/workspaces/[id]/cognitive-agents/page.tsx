'use client';

import {useParams} from 'next/navigation';
import {CognitiveAgentList} from '@/components/cognitive-agents/cognitive-agent-list';

export default function CognitiveAgentsListPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return (
    <div className="space-y-8 px-8 pt-4">
      <CognitiveAgentList workspaceId={workspaceId} />
    </div>
  );
}
