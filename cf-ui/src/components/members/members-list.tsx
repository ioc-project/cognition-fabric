'use client';

import {Users, MoreVertical, Trash2, User, Crown} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {ResourceTable} from '@/components/ui/resource-table';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useWorkspaceMembers} from '@/hooks/useWorkspaceMembers';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {toast} from 'sonner';
import {useSession} from 'next-auth/react';

interface MembersListProps {
  workspaceId: string;
  onInvite?: () => void;
}

export function MembersList({workspaceId, onInvite}: MembersListProps) {
  const {data: session} = useSession();
  const {members, removeMember} = useWorkspaceMembers(workspaceId);
  const removeDialog = useConfirmDialog<{userId: string; username: string}>();

  const currentUserId = session?.user?.id;

  const handleRemoveMember = async () => {
    await removeDialog.confirm(async (data) => {
      try {
        await removeMember(data.userId);
        void toast.success(`${data.username} removed from workspace`);
      } catch (err) {
        const msg = parseError(err);
        void toast.error(msg);
        throw err;
      }
    });
  };

  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <ListShell
          empty={{
            icon: Users,
            title: 'No members in this workspace',
            description: 'Invite team members to collaborate on this workspace.',
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
        items={members}
        headers={[{content: 'Username'}, {content: 'Role'}, {content: 'Joined'}, {content: 'Actions', className: 'text-right'}]}
        rowKey={(member) => member.id}
        renderRow={(member) => [
          {content: member.username || 'Unknown', className: 'font-medium'},
          {
            content: (
              <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                {member.role === 'admin' ? <Crown className="h-3 w-3 mr-1" /> : <User className="h-3 w-3 mr-1" />}
                {member.role}
              </Badge>
            )
          },
          {
            content: member.joined_at ? new Date(member.joined_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'
          },
          {
            content:
              member.user_id === currentUserId ? null : (
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
                        removeDialog.open({userId: member.user_id, username: member.username || 'Unknown'});
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Member
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            className: 'text-right'
          }
        ]}
      />

      <ConfirmDialog
        open={removeDialog.isOpen}
        onOpenChange={removeDialog.close}
        title="Remove Member"
        description={`Are you sure you want to remove ${removeDialog.data?.username} from this workspace? They will lose access to all resources.`}
        confirmText="Remove Member"
        onConfirm={handleRemoveMember}
        variant="destructive"
      />
    </>
  );
}
