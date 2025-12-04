'use client';

import {useParams, usePathname} from 'next/navigation';
import {useWorkspace} from '@/hooks/useApi';

export function useCurrentWorkspace() {
  const params = useParams();
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith('/workspaces');

  const rawId = params?.id;
  const workspaceId = isWorkspaceRoute ? ((Array.isArray(rawId) ? rawId[0] : rawId) ?? '') : '';
  const {workspace, isLoading, mutate} = useWorkspace(workspaceId);

  return {workspaceId: workspaceId || undefined, workspace, isLoading, mutate};
}
