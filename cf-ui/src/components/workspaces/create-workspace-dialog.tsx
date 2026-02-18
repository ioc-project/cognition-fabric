'use client';

import {z} from 'zod';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {workspaceApi, userApi, invitationApi} from '@/api/endpoints';
import useSWR from 'swr';
import {MultiSelect} from '@/components/ui/multi-select';
import {useSession} from 'next-auth/react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';

const formSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').min(3, 'Workspace name must be at least 3 characters'),
  users: z.array(z.string()).optional(),
  userRoles: z.record(z.enum(['admin', 'viewer', 'guest'])).optional(),
  config: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (workspaceId: string) => void;
}

export function CreateWorkspaceDialog({open, onOpenChange, onSuccess}: CreateWorkspaceDialogProps) {
  const {data: session} = useSession();
  const {data: usersData, error: usersError} = useSWR('all-users', () => userApi.list());

  if (usersError) {
    console.warn('Failed to load users list:', usersError);
  }

  const currentUserId = session?.user?.id;
  const availableUsers = usersData?.users?.filter((u: any) => u.id !== currentUserId && u.username !== 'admin') || [];

  const handleSubmit = async (values: FormValues) => {
    let config: Record<string, any> | undefined = undefined;
    if (values.config) {
      try {
        config = JSON.parse(values.config);
      } catch {
        throw new Error('Config must be valid JSON');
      }
    }

    const response = await workspaceApi.create({
      name: values.name,
      ...(config ? {config} : {})
    });

    if (values.users && values.users.length > 0) {
      const invitationPromises = values.users.map((userId) => {
        const user = availableUsers.find((u: any) => u.id === userId);
        if (!user) {
          return Promise.resolve();
        }

        const role = values.userRoles?.[userId] || 'viewer';
        return invitationApi
          .create(response.id, {
            invitee_username: user.username,
            role
          })
          .catch((err) => {
            console.warn(`Failed to invite ${user.username}:`, err);
            return null;
          });
      });

      await Promise.allSettled(invitationPromises);
    }

    toast.success(`Workspace "${values.name}" created successfully`);

    await swrMutate(swrKeys.workspaces());

    onSuccess(response.id);

    void workspaceApi
      .get(response.id)
      .then((workspace) => swrMutate(swrKeys.workspace(response.id), workspace, {revalidate: false}))
      .catch(() => undefined);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Workspace"
      description="Create a new workspace to manage and organize your resources"
      schema={formSchema}
      defaultValues={{name: '', users: [], userRoles: {}, config: ''}}
      onSubmit={handleSubmit}
      submitLabel="Create Workspace"
      loadingLabel="Creating Workspace..."
      errorFieldName="name"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel required>Workspace Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter workspace name" {...field} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="users"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel>Add Members</FormLabel>
                  <FormControl>
                    <MultiSelect
                      placeholder={usersData ? (availableUsers.length ? 'Select members to add' : 'No members available') : 'Loading members...'}
                      options={availableUsers.map((u: any) => ({
                        label: u.username,
                        value: u.id
                      }))}
                      value={Array.isArray(field.value) ? field.value : []}
                      onChange={(newValue) => {
                        field.onChange(newValue);
                        const currentRoles = form.getValues('userRoles') || {};
                        const updatedRoles = {...currentRoles};
                        newValue.forEach((userId: string) => {
                          if (!updatedRoles[userId]) {
                            updatedRoles[userId] = 'viewer';
                          }
                        });
                        form.setValue('userRoles', updatedRoles);
                      }}
                      disabled={!usersData}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {(form.watch('users') || []).length > 0 && (
            <div className="space-y-2">
              <FormLabel>Assign Roles</FormLabel>
              <div className="space-y-2">
                {(form.watch('users') || []).map((userId: string) => {
                  const user = availableUsers.find((u: any) => u.id === userId);
                  if (!user) {
                    return null;
                  }

                  return (
                    <div key={userId} className="flex items-center justify-between gap-3 p-2 rounded-md bg-background border">
                      <span className="text-sm font-medium truncate flex-1">{user.username}</span>
                      <FormField
                        control={form.control}
                        name={`userRoles.${userId}` as any}
                        render={({field}) => (
                          <Select
                            value={field.value || 'viewer'}
                            onValueChange={(value) => {
                              const currentRoles = form.getValues('userRoles') || {};
                              form.setValue('userRoles', {...currentRoles, [userId]: value as 'admin' | 'viewer'});
                            }}
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          const currentUsers = form.getValues('users') || [];
                          const currentRoles = form.getValues('userRoles') || {};
                          const newUsers = currentUsers.filter((id: string) => id !== userId);
                          const {[userId]: _, ...newRoles} = currentRoles;
                          form.setValue('users', newUsers);
                          form.setValue('userRoles', newRoles);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="config"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel>Config (JSON)</FormLabel>
                  <FormControl>
                    <Input placeholder='{"key":"value"}' {...field} />
                  </FormControl>
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
