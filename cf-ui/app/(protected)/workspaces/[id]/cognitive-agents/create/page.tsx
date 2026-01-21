'use client';

import {useParams} from 'next/navigation';
import {CreateCognitiveAgentForm} from '@/components/cognitive-agents/create-cognitive-agent-form';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function CreateCognitiveAgentPage() {
  const params = useParams();
  const {workspaceId: currentId} = useCurrentWorkspace();
  const workspaceId = currentId || (params.id as string);

  return <CreateCognitiveAgentForm workspaceId={workspaceId} />;
}
