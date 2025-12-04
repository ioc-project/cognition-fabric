'use client';

import {useParams, usePathname} from 'next/navigation';
import {useWorkspace} from '@/hooks/useApi';

export function useCurrentWorkspace() {
  const params = useParams() as Record<string, string | undefined>;
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith('/workspaces');

  const workspaceId = isWorkspaceRoute ? (params?.id ?? '') : '';
  const {workspace, isLoading, mutate} = useWorkspace(workspaceId);

  return {workspaceId: workspaceId || undefined, workspace, isLoading, mutate};
}
