'use client';

import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {useApiKeys} from '@/hooks/useApiKeys';
import {z} from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100, 'API key name must be at most 100 characters')
});

type FormValues = {name: string};

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: {id: string; apiKey: string}) => void;
}

export function CreateApiKeyDialog({open, onOpenChange, onSuccess}: CreateApiKeyDialogProps) {
  const {generateApiKey, isLoading} = useApiKeys();

  const handleSubmit = async (values: FormValues) => {
    const response = await generateApiKey({name: values.name});
    onSuccess({id: response.id, apiKey: response.key || response.api_key});
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create API Key"
      description="Provide a name for your API key. The key will be generated with the ioc_ prefix."
      schema={formSchema}
      defaultValues={{name: ''}}
      onSubmit={handleSubmit}
      submitLabel="Create API Key"
      isLoading={isLoading}
      errorFieldName="name"
    >
      {(form) => (
        <FormField
          control={form.control}
          name="name"
          render={({field}) => (
            <FormItem>
              <div className="space-y-2">
                <FormLabel>API Key Name</FormLabel>
                <FormControl>
                  <Input placeholder="My API Key" {...field} maxLength={100} />
                </FormControl>
                <p className="text-xs text-muted-foreground">1-100 characters</p>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </FormModal>
  );
}
