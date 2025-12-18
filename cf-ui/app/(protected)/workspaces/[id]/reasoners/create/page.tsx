'use client';

import {useParams} from 'next/navigation';
import {CreateReasonerForm} from '@/components/reasoners/create-reasoner-form';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function CreateReasonerPage() {
  const params = useParams();
  const {workspaceId: currentId} = useCurrentWorkspace();
  const workspaceId = (currentId || (params.id as string)) as string;

  return <CreateReasonerForm workspaceId={workspaceId} />;
}
