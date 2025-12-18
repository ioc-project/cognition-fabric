'use client';

import {useParams} from 'next/navigation';
import {MASList} from '@/components/mas/mas-list';

export default function MASListPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  return <MASList workspaceId={workspaceId} />;
}
