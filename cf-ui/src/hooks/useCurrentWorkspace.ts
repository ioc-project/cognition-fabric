'use client';

import {useParams} from 'next/navigation';
import {useWorkspace} from '@/hooks/useApi';

export function useCurrentWorkspace() {
  const params = useParams() as Record<string, string | undefined>;
  const workspaceId = params?.id ?? '';
  const {workspace, isLoading, mutate} = useWorkspace(workspaceId);

  return {workspaceId: workspaceId || undefined, workspace, isLoading, mutate};
}
