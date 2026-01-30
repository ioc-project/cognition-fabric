'use client';

import {Mail, MoreVertical, Trash2, User, Crown} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {ResourceTable} from '@/components/ui/resource-table';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useWorkspaceInvitations} from '@/hooks/useApi';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {toast} from 'sonner';
import type {Invitation, InvitationStatus} from '@/api/types';

interface InvitationsListProps {
  workspaceId: string;
  onInvite?: () => void;
}

const statusVariants: Record<InvitationStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'default',
  accepted: 'secondary',
  declined: 'outline',
  expired: 'destructive'
};

const statusLabels: Record<InvitationStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired'
};

export function InvitationsList({workspaceId, onInvite}: InvitationsListProps) {
  const {invitations, cancelInvitation} = useWorkspaceInvitations(workspaceId);
  const cancelDialog = useConfirmDialog<{id: string; username: string}>();

  const handleCancelInvitation = async () => {
    await cancelDialog.confirm(async (data) => {
      try {
        await cancelInvitation(data.id);
        toast.success(`Invitation to ${data.username} cancelled`);
      } catch (err) {
        const msg = parseError(err);
        toast.error(msg);
        throw err;
      }
    });
  };

  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

  if (pendingInvitations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <ListShell
          empty={{
            icon: Mail,
            title: 'No pending invitations',
            description: 'Invite team members to join this workspace.',
            actionLabel: 'Invite Member',
            onAction: onInvite
          }}
        />
      </div>
    );
  }

  return (
    <>
      <ResourceTable
        items={pendingInvitations}
        headers={[
          {content: 'Username'},
          {content: 'Status'},
          {content: 'Role'},
          {content: 'Invited By'},
          {content: 'Expires'},
          {content: 'Actions', className: 'text-right'}
        ]}
        rowKey={(invitation) => invitation.id}
        renderRow={(invitation: Invitation) => [
          {content: invitation.invitee_username, className: 'font-medium'},
          {
            content: (
              <Badge variant={statusVariants[invitation.status]} className="capitalize">
                {statusLabels[invitation.status]}
              </Badge>
            )
          },
          {
            content: (
              <Badge variant={invitation.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                {invitation.role === 'admin' ? <Crown className="h-3 w-3 mr-1" /> : <User className="h-3 w-3 mr-1" />}
                {invitation.role}
              </Badge>
            )
          },
          {content: invitation.inviter_username, className: 'text-muted-foreground'},
          {
            content: new Date(invitation.expires_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS),
            className: 'text-muted-foreground'
          },
          {
            content: (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-red-600 dark:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelDialog.open({id: invitation.id, username: invitation.invitee_username});
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Cancel Invitation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
            className: 'text-right'
          }
        ]}
      />

      <ConfirmDialog
        open={cancelDialog.isOpen}
        onOpenChange={cancelDialog.close}
        title="Cancel Invitation"
        description={`Are you sure you want to cancel the invitation to ${cancelDialog.data?.username}? They will no longer be able to accept it.`}
        confirmText="Cancel Invitation"
        onConfirm={handleCancelInvitation}
        variant="destructive"
      />
    </>
  );
}
