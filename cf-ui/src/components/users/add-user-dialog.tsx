'use client';

import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {parseError} from '@/lib/utils';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address')
});

type FormValues = z.infer<typeof formSchema>;

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (data: FormValues) => Promise<void>;
}

export function AddUserDialog({open, onOpenChange, onSuccess}: AddUserDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: ''
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await onSuccess(values);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = parseError(error);
      form.setError('root', {
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
      <Button type="submit" form="add-user-form" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Adding...' : 'Add User'}
      </Button>
    </div>
  );

  return (
    <Modal open={open} onOpenChange={handleOpenChange} title="Add New User" description="Add a new user to the workspace" footer={footer}>
      <Form {...form}>
        <form id="add-user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter user name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({field}) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Enter user email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {form.formState.errors.root && <FormMessage>{form.formState.errors.root.message}</FormMessage>}
        </form>
      </Form>
    </Modal>
  );
}
