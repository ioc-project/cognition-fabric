'use client';

import {useParams} from 'next/navigation';
import {CreateMASForm} from '@/components/mas/create-mas-form';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function CreateMas() {
  const params = useParams();
  const {workspaceId: currentId} = useCurrentWorkspace();
  const workspaceId = currentId || (params.id as string);

  return <CreateMASForm workspaceId={workspaceId} />;
}
