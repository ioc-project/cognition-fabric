'use client';

import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useWorkspaceInvitations} from '@/hooks/useApi';
import {CreateInvitationRequestSchema, InvitationRole} from '@/api/types';
import {toast} from 'sonner';

const formSchema = CreateInvitationRequestSchema;

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
  const {createInvitation} = useWorkspaceInvitations(workspaceId);

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
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="username" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Enter the username of the person you want to invite</p>
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
                      <SelectItem value="guest">Guest</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Admin can manage workspace and invite users, Viewer can view resources, Guest has limited access
                  </p>
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
