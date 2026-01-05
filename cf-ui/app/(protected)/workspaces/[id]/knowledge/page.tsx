'use client';

import {useParams} from 'next/navigation';
import {KEPList} from '@/components/kep/kep-list';

export default function KnowledgeAdaptersList() {
  const params = useParams();
  const workspaceId = params.id as string;

  return <KEPList workspaceId={workspaceId} />;
}
