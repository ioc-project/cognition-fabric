'use client';

import {useParams} from 'next/navigation';
import {CfnList} from '@/components/cfn/cfn-list';

export default function CfnListPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return <CfnList workspaceId={workspaceId} />;
}
