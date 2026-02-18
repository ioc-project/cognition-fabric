'use client';

import {useParams} from 'next/navigation';
import {CreateCognitiveEngineForm} from '@/components/cognitive-engines/create-cognitive-engine-form';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function CreateCognitiveEnginePage() {
  const params = useParams();
  const {workspaceId: currentId} = useCurrentWorkspace();
  const workspaceId = currentId || (params.id as string);

  return <CreateCognitiveEngineForm workspaceId={workspaceId} />;
}
