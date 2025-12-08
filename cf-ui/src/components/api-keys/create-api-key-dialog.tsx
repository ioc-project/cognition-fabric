'use client';

import * as z from 'zod';
import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
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

  const handleSubmit = async (values: FormValues) => {
    const response = await generateApiKey({name: values.name, roles: values.roles});
    onSuccess({id: response.id, apiKey: response['api-key']});
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create API Key"
      description="Provide a name and one or more roles to create an API key (IAM admin scope)."
      schema={formSchema}
      defaultValues={{name: '', roles: []}}
      onSubmit={handleSubmit}
      submitLabel="Create API Key"
      isLoading={isLoading}
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
        </>
      )}
    </FormModal>
  );
}
