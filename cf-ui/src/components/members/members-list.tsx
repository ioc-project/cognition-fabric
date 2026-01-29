'use client';

import {useState} from 'react';
import {Users, MoreVertical, Trash2, Shield} from 'lucide-react';
import {Card} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {ListShell} from '@/components/ui/list-shell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useWorkspaceMembers} from '@/hooks/useApi';
import {parseError, DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {toast} from 'sonner';
import type {WorkspaceMember, MemberRole} from '@/api/types';

interface MembersListProps {
  workspaceId: string;
  onInvite?: () => void;
}

const roleVariants: Record<MemberRole, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  viewer: 'secondary',
  guest: 'outline'
};

export function MembersList({workspaceId, onInvite}: MembersListProps) {
  const {members, isLoading, removeMember, updateMemberRole} = useWorkspaceMembers(workspaceId);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const removeDialog = useConfirmDialog<{id: string; username: string}>();

  const handleRemoveMember = async () => {
    await removeDialog.confirm(async (data) => {
      try {
        await removeMember(data.id);
        toast.success(`${data.username} removed from workspace`);
        setDeleteError(null);
      } catch (err) {
        const msg = parseError(err);
        setDeleteError(msg);
        toast.error(msg);
        throw err;
      }
    });
  };

  const handleChangeRole = async (memberId: string, username: string, newRole: MemberRole) => {
    try {
      await updateMemberRole(memberId, {role: newRole});
      toast.success(`${username}'s role updated to ${newRole}`);
    } catch (err) {
      const msg = parseError(err);
      toast.error(msg);
    }
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
      <div className="list-grid">
        {members.map((member: WorkspaceMember) => (
          <Card key={member.id} variant="list" className="transition-shadow duration-200">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="rounded-lg bg-[hsl(var(--accent))] w-12 h-12 flex items-center justify-center mb-4">
                  <Users className="w-5 h-5 text-card-foreground" />
                </div>
                <h4 className="card-title truncate mb-2">{member.username}</h4>
                <p className="text-sm text-muted-foreground mb-3">{member.email}</p>
                <Badge variant={roleVariants[member.role]}>{member.role}</Badge>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleChangeRole(member.id, member.username, 'admin')} disabled={member.role === 'admin'}>
                    <Shield className="h-4 w-4 mr-2" />
                    Admin
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleChangeRole(member.id, member.username, 'viewer')} disabled={member.role === 'viewer'}>
                    <Shield className="h-4 w-4 mr-2" />
                    Viewer
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleChangeRole(member.id, member.username, 'guest')} disabled={member.role === 'guest'}>
                    <Shield className="h-4 w-4 mr-2" />
                    Guest
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => removeDialog.open({id: member.id, username: member.username})}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Member
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="text-xs text-muted-foreground">
              Joined {new Date(member.joined_at).toLocaleDateString(undefined, DATE_TIME_FORMAT_OPTIONS)}
            </div>
          </Card>
        ))}
      </div>

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
