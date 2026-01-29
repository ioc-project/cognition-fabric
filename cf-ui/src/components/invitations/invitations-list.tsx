'use client';

import {useState} from 'react';
import {Mail, MoreVertical, Trash2, Clock, User} from 'lucide-react';
import {Card} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
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
  const {invitations, isLoading, cancelInvitation} = useWorkspaceInvitations(workspaceId);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const cancelDialog = useConfirmDialog<{id: string; username: string}>();

  const handleCancelInvitation = async () => {
    await cancelDialog.confirm(async (data) => {
      try {
        await cancelInvitation(data.id);
        toast.success(`Invitation to ${data.username} cancelled`);
        setDeleteError(null);
      } catch (err) {
        const msg = parseError(err);
        setDeleteError(msg);
        toast.error(msg);
        throw err;
      }
    });
  };

  if (invitations.length === 0) {
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
      <div className="list-grid">
        {invitations.map((invitation: Invitation) => (
          <Card key={invitation.id} variant="list" className="transition-shadow duration-200">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="rounded-lg bg-[hsl(var(--accent))] w-12 h-12 flex items-center justify-center mb-4">
                  <Mail className="w-5 h-5 text-card-foreground" />
                </div>
                <h4 className="card-title truncate mb-2">{invitation.invitee_username}</h4>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={statusVariants[invitation.status]}>{statusLabels[invitation.status]}</Badge>
                  <Badge variant="outline">{invitation.role}</Badge>
                </div>
              </div>

              {invitation.status === 'pending' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => cancelDialog.open({id: invitation.id, username: invitation.invitee_username})}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Cancel Invitation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center text-muted-foreground">
                <User className="h-4 w-4 mr-2" />
                <span className="text-xs">Invited by {invitation.inviter_username}</span>
              </div>
              <div className="flex items-center text-muted-foreground">
                <Clock className="h-4 w-4 mr-2" />
                <span className="text-xs">
                  {invitation.status === 'pending'
                    ? `Expires ${new Date(invitation.expires_at).toLocaleDateString(undefined, DATE_TIME_FORMAT_OPTIONS)}`
                    : `Created ${new Date(invitation.created_at).toLocaleDateString(undefined, DATE_TIME_FORMAT_OPTIONS)}`}
                </span>
              </div>
              {invitation.responded_at && (
                <div className="text-xs text-muted-foreground">
                  Responded {new Date(invitation.responded_at).toLocaleDateString(undefined, DATE_TIME_FORMAT_OPTIONS)}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

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
