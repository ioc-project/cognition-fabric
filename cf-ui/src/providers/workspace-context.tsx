'use client';

import {createContext, useContext} from 'react';
import {useParams} from 'next/navigation';
import {useWorkspace} from '@/hooks/useApi';

type WorkspaceContextValue = {
  workspaceId?: string;
  workspace: ReturnType<typeof useWorkspace>['workspace'];
  isLoading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({children}: {children: React.ReactNode}) {
  const params = useParams() as Record<string, string | undefined>;
  const currentId = params?.id;
  const {workspace, isLoading} = useWorkspace(currentId || '');

  return <WorkspaceContext.Provider value={{workspaceId: currentId, workspace, isLoading}}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) return {workspaceId: undefined, workspace: null, isLoading: false} as WorkspaceContextValue;
  return ctx;
}
