'use client';

import {useParams} from 'next/navigation';
import {CognitiveAgentList} from '@/components/cognitive-agents/cognitive-agent-list';

export default function CognitiveAgentsListPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return <CognitiveAgentList workspaceId={workspaceId} />;
}
