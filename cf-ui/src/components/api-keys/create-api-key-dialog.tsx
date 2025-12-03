'use client';

import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import * as z from 'zod';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {useApiKeys} from '@/hooks/useApi';

const formSchema = z.object({
  name: z.string().min(1, 'API key name is required').min(3, 'API key name must be at least 3 characters'),
  roles: z.array(z.string()).min(1, 'Select at least one role')
});

type FormValues = z.infer<typeof formSchema>;

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: {id: string; apiKey: string}) => void;
}

export function CreateApiKeyDialog({open, onOpenChange, onSuccess}: CreateApiKeyDialogProps) {
  const {roles, generateApiKey, isLoading} = useApiKeys();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      roles: []
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const response = await generateApiKey({name: values.name, roles: values.roles});
      form.reset();
      onSuccess({id: response.id, apiKey: response['api-key']});
    } catch (error) {
      form.setError('name', {
        type: 'manual',
        message: 'Failed to create API key'
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
      <Button type="submit" form="create-api-key-form" disabled={form.formState.isSubmitting || isLoading} variant="sidebar">
        {form.formState.isSubmitting ? 'Creating...' : 'Create API Key'}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Create API Key"
      description="Provide a name and one or more roles to create an API key (IAM admin scope)."
      onInteractOutside={(e) => {
        e.preventDefault();
      }}
      contentClassName="sm:max-w-[480px] p-6 gap-4"
      footer={footer}
    >
      <Form {...form}>
        <form id="create-api-key-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel>API Key Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My API Key" {...field} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="roles"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel>Roles</FormLabel>
                  <div className="flex flex-col gap-2">
                    {roles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No roles available</p>
                    ) : (
                      roles.map((role) => (
                        <label key={role} className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={field.value?.includes(role)}
                            onChange={(e) =>
                              field.onChange(
                                e.target.checked ? [...(field.value || []), role] : (field.value || []).filter((r: string) => r !== role)
                              )
                            }
                          />
                          <span className="text-sm">{role}</span>
                        </label>
                      ))
                    )}
                  </div>
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
