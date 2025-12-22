'use client';

import {z} from 'zod';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {workspaceApi, userApi} from '@/api/endpoints';
import useSWR from 'swr';
import {MultiSelect} from '@/components/ui/multi-select';

const formSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').min(3, 'Workspace name must be at least 3 characters'),
  users: z.array(z.string()).optional(),
  config: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (workspaceId: string) => void;
}

export function CreateWorkspaceDialog({open, onOpenChange, onSuccess}: CreateWorkspaceDialogProps) {
  const {data: usersData} = useSWR('all-users', () => userApi.list());

  const handleSubmit = async (values: FormValues) => {
    let config: Record<string, any> | undefined = undefined;
    if (values.config) {
      try {
        config = JSON.parse(values.config);
      } catch (e) {
        throw new Error('Config must be valid JSON');
      }
    }
    const response = await workspaceApi.create({
      name: values.name,
      ...(values.users && values.users.length > 0 ? {users: values.users} : {}),
      ...(config ? {config} : {})
    });
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
      defaultValues={{name: '', users: [], config: ''}}
      onSubmit={handleSubmit}
      submitLabel="Create Workspace"
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
                  <FormLabel>Workspace Name</FormLabel>
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
                  <FormLabel>Users (optional)</FormLabel>
                  <FormControl>
                    <MultiSelect
                      placeholder={usersData ? (usersData.users?.length ? 'Select users' : 'No users found') : 'Loading users...'}
                      options={
                        usersData?.users?.map((u: any) => ({
                          label: u.username,
                          value: u.id
                        })) || []
                      }
                      value={Array.isArray(field.value) ? field.value : []}
                      onChange={field.onChange}
                      disabled={!usersData}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="config"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel>Config (JSON, optional)</FormLabel>
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
