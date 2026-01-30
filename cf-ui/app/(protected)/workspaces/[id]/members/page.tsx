'use client';

import {WorkspaceMembersPage} from '@/components/members/workspace-members-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {useRouter} from 'next/navigation';
import {useEffect} from 'react';
import {routes} from '@/constants/routes';
import {LoaderRelative} from '@/components/ui/loading';

export default function MembersPage() {
  const {workspaceId, isAdmin, isLoading} = useCurrentWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAdmin && workspaceId) {
      router.replace(routes.workspaces.details(workspaceId));
    }
  }, [isAdmin, isLoading, workspaceId, router]);

  if (isLoading) {
    return (
      <div className="px-8 pt-4">
        <LoaderRelative />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return <WorkspaceMembersPage />;
}
