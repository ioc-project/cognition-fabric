'use client';

import {useState, useMemo} from 'react';
import {Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {BasePage} from '@/components/ui/base-page';
import {LoaderRelative} from '@/components/ui/loading';
import {MembersList} from '@/components/members/members-list';
import {InvitationsList} from '@/components/invitations/invitations-list';
import {CreateInvitationDialog} from '@/components/invitations/create-invitation-dialog';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {useWorkspaceMembers, useWorkspaceInvitations} from '@/hooks/useApi';

type ViewMode = 'members' | 'invitations';

export function WorkspaceMembersPage() {
  const {workspaceId, workspace, isLoading: workspaceLoading} = useCurrentWorkspace();
  const {isLoading: membersLoading} = useWorkspaceMembers(workspaceId || '');
  const {invitations, isLoading: invitationsLoading} = useWorkspaceInvitations(workspaceId || '');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('members');

  const workspaceName = workspace?.name || 'Workspace';
  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

  const tabs = useMemo(
    () => [
      {key: 'members', title: 'Members', link: '#'},
      {
        key: 'invitations',
        title: `Pending Invitations${!invitationsLoading && pendingInvitations.length > 0 ? ` (${pendingInvitations.length})` : ''}`,
        link: '#'
      }
    ],
    [pendingInvitations.length, invitationsLoading]
  );

  if (workspaceLoading) {
    return (
      <div className="space-y-8 px-8 pt-4 relative z-0">
        <LoaderRelative />
      </div>
    );
  }

  if (!workspaceId || !workspace) {
    return null;
  }

  return (
    <>
      <div className="space-y-8 px-8 pt-4 relative z-0">
        <BasePage
          title="Members"
          description="View and manage workspace members and invitations"
          tabs={tabs}
          activeTabKey={viewMode}
          onTabChange={(key) => setViewMode(key as ViewMode)}
          callToAction={
            <Button onClick={() => setIsInviteDialogOpen(true)} variant="sidebar" className="gap-2">
              <Plus className="h-4 w-4" />
              Invite Member
            </Button>
          }
        >
          {viewMode === 'members' &&
            (membersLoading ? <LoaderRelative /> : <MembersList workspaceId={workspaceId} onInvite={() => setIsInviteDialogOpen(true)} />)}
          {viewMode === 'invitations' &&
            (invitationsLoading ? <LoaderRelative /> : <InvitationsList workspaceId={workspaceId} onInvite={() => setIsInviteDialogOpen(true)} />)}
        </BasePage>
      </div>

      <CreateInvitationDialog
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
      />
    </>
  );
}
