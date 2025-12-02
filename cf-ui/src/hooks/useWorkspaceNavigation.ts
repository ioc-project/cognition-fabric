'use client';

import {useRouter} from 'next/navigation';
import {useWorkspaceContext} from '@/providers/workspace-context';

export function useWorkspaceNavigation() {
  const router = useRouter();
  const {workspaceId} = useWorkspaceContext();

  const currentId = workspaceId || undefined;
  const base = currentId ? `/workspaces/${currentId}` : '/workspaces';

  const goToWorkspace = (id: string) => router.push(`/workspaces/${id}`);

  return {currentId, base, goToWorkspace};
}
