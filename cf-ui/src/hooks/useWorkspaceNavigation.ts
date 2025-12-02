'use client';

import {useRouter} from 'next/navigation';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';

export function useWorkspaceNavigation() {
  const router = useRouter();
  const {workspaceId} = useCurrentWorkspace();

  const currentId = workspaceId || undefined;
  const base = currentId ? `/workspaces/${currentId}` : '/workspaces';

  const goToWorkspace = (id: string) => router.push(`/workspaces/${id}`);

  return {currentId, base, goToWorkspace};
}
