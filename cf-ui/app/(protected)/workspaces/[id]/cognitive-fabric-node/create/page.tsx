'use client';

import {useParams} from 'next/navigation';
import {CreateCfnForm} from '@/components/cfn/create-cfn-form';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export default function CreateCfn() {
  const params = useParams();
  const {workspaceId: currentId} = useCurrentWorkspace();
  const workspaceId = currentId || (params.id as string);

  return <CreateCfnForm workspaceId={workspaceId} />;
}
