'use client';

import {useParams} from 'next/navigation';
import {CreateKEPForm} from '@/components/kep/create-kep-form';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function CreateKEP() {
  const params = useParams();
  const {workspaceId: currentId} = useCurrentWorkspace();
  const workspaceId = currentId || (params.id as string);

  return <CreateKEPForm workspaceId={workspaceId} />;
}
