'use client';

import {useParams} from 'next/navigation';
import {CognitiveEngineList} from '@/components/cognitive-engines/cognitive-engine-list';

export default function CognitiveAgentsListPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return <CognitiveEngineList workspaceId={workspaceId} />;
}
