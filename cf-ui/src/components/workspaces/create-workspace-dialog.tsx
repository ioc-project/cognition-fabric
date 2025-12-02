'use client';

import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import * as z from 'zod';
import {Button} from '@/components/ui/button';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {Modal} from '@/components/ui/modal';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {parseError} from '@/lib/utils';
import {workspaceApi} from '@/api';

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
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: ''
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const response = await workspaceApi.create({name: values.name});
      await swrMutate(swrKeys.workspaces());
      form.reset();
      onSuccess(response.id);
    } catch (error) {
      const errorMessage = parseError(error);
      form.setError('name', {
        type: 'manual',
        message: errorMessage
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  const footer = (
    <div className="flex w-full items-center justify-between">
      <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button type="submit" form="create-workspace-form" disabled={form.formState.isSubmitting} variant="sidebar">
        {form.formState.isSubmitting ? 'Creating...' : 'Create Workspace'}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Create New Workspace"
      description="Create a new workspace to manage and organize your TKF resources"
      onInteractOutside={(e) => {
        e.preventDefault();
      }}
      contentClassName="sm:max-w-[480px] p-6 gap-4"
      footer={footer}
    >
      <Form {...form}>
        <form id="create-workspace-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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
        </form>
      </Form>
    </Modal>
  );
}
