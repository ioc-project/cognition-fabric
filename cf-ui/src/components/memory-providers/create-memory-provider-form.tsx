'use client';

import {z} from 'zod';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {BasePage} from '@/components/ui/base-page';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {breadcrumbs} from '@/constants/routes';

const formSchema = z.object({
  memory_provider_name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  host: z.string().min(1, 'Host is required'),
  port: z
    .string()
    .min(1, 'Port is required')
    .refine(
      (val) => {
        const num = Number(val);
        return !isNaN(num) && Number.isInteger(num) && num >= 1 && num <= 65535;
      },
      {message: 'Port must be an integer between 1 and 65535'}
    )
});

type FormValues = z.infer<typeof formSchema>;

interface CreateMemoryProviderFormProps {
  onCancel?: () => void;
}

export function CreateMemoryProviderForm({onCancel}: CreateMemoryProviderFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {addProvider} = useMemoryProviders();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memory_provider_name: '',
      host: '',
      port: ''
    }
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await addProvider({
        memory_provider_name: values.memory_provider_name,
        config: {
          host: values.host,
          port: Number(values.port)
        }
      });

      toast.success(`Memory Provider "${response.memory_provider_name}" registered successfully`);

      router.push(routes.memoryProviders.list);
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to register Memory Provider: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(routes.memoryProviders.list);
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Register Memory Provider"
        description="Add a new memory provider to your workspace."
        useBreadcrumbs
        breadcrumbs={breadcrumbs.createMemoryProvider()}
      >
        <div className="flex justify-center">
          <Card className="w-full max-w-4xl">
            <CardContent className="p-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  {error && (
                    <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                      {error}
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="memory_provider_name"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>Provider Name</FormLabel>
                        <FormControl>
                          <Input placeholder="ioc-knowledge-memory-svc" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="host"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="ioc-knowledge-memory-svc" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="port"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>Port</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="9003" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex w-full items-center justify-between pt-4">
                    {onCancel ? (
                      <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
                        Cancel
                      </Button>
                    ) : (
                      <Button asChild type="button" variant="outline" disabled={isLoading}>
                        <Link href={routes.memoryProviders.list}>Cancel</Link>
                      </Button>
                    )}
                    <Button type="submit" variant="sidebar" disabled={isLoading}>
                      {isLoading ? 'Registering...' : 'Register Memory Provider'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </BasePage>
    </div>
  );
}
