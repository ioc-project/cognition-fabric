'use client';

import {z} from 'zod';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {workspaceApi} from '@/api/endpoints';

const formSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').min(3, 'Workspace name must be at least 3 characters')
});

type FormValues = z.infer<typeof formSchema>;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (workspaceId: string) => void;
}

export function CreateWorkspaceDialog({open, onOpenChange, onSuccess}: CreateWorkspaceDialogProps) {
  const handleSubmit = async (values: FormValues) => {
    const response = await workspaceApi.create({name: values.name});
    await swrMutate(swrKeys.workspaces());
    onSuccess(response.id);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Workspace"
      description="Create a new workspace to manage and organize your TKF resources"
      schema={formSchema}
      defaultValues={{name: ''}}
      onSubmit={handleSubmit}
      submitLabel="Create Workspace"
      errorFieldName="name"
    >
      {(form) => (
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
      )}
    </FormModal>
  );
}
