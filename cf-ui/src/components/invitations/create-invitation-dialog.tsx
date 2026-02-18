'use client';

import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useWorkspaceInvitations} from '@/hooks/useInvitations';
import {useWorkspaceMembers} from '@/hooks/useWorkspaceMembers';
import {InvitationRole} from '@/api/types';
import {toast} from 'sonner';
import useSWR from 'swr';
import {userApi} from '@/api/endpoints';
import {useSession} from 'next-auth/react';
import {z} from 'zod';

const formSchema = z.object({
  invitee_username: z.string().min(1, 'Username is required'),
  role: z.enum(['admin', 'viewer', 'guest'])
});

type FormValues = {
  invitee_username: string;
  role: InvitationRole;
};

interface CreateInvitationDialogProps {
  workspaceId: string;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInvitationDialog({workspaceId, workspaceName, open, onOpenChange}: CreateInvitationDialogProps) {
  const {data: session} = useSession();
  const {createInvitation} = useWorkspaceInvitations(workspaceId);
  const {members} = useWorkspaceMembers(workspaceId);
  const {data: usersData, error: usersError} = useSWR('all-users', () => userApi.list());

  if (usersError) {
    console.warn('Failed to load users list:', usersError);
  }

  const currentUserId = session?.user?.id;
  const memberUsernames = new Set(members.map((m) => m.username));
  const availableUsers =
    usersData?.users?.filter(
      (u: {id: string; username: string}) => u.id !== currentUserId && u.username !== 'admin' && !memberUsernames.has(u.username)
    ) || [];

  const handleSubmit = async (values: FormValues) => {
    await createInvitation(values);
    toast.success(`Invitation sent to ${values.invitee_username}`);
    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Invite Member to ${workspaceName}`}
      description="Enter the username and select a role for the new member. They will have 7 days to accept the invitation."
      schema={formSchema}
      defaultValues={{invitee_username: '', role: 'viewer' as InvitationRole}}
      onSubmit={handleSubmit}
      submitLabel="Send Invitation"
      errorFieldName="invitee_username"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="invitee_username"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel required>Username</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={usersData ? (availableUsers.length ? 'Select a user' : 'No users available') : 'Loading users...'}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableUsers.map((u: any) => (
                        <SelectItem key={u.id} value={u.username}>
                          {u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Select the user you want to invite</p>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="role"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Admin can manage workspace and invite users, Viewer can view resources</p>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </FormModal>
  );
}
