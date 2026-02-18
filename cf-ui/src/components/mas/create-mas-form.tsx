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
import {Textarea} from '@/components/ui/textarea';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {BasePage} from '@/components/ui/base-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {breadcrumbs} from '@/constants/routes';
import {useMAS} from '@/hooks/useMAS';

const formSchema = z.object({
  name: z.string().min(1, 'Multi-Agent System name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  agents: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') {
        return {};
      }
      try {
        return JSON.parse(val);
      } catch {
        throw new Error('Invalid JSON format for agents');
      }
    }),
  config: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') {
        return {};
      }
      try {
        return JSON.parse(val);
      } catch {
        throw new Error('Invalid JSON format for config');
      }
    })
});

type FormValues = z.infer<typeof formSchema>;

interface CreateMASFormProps {
  workspaceId: string;
  onCancel?: () => void;
}

export function CreateMASForm({workspaceId, onCancel}: CreateMASFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || 'Workspace';
  const {addMAS} = useMAS(workspaceId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      agents: '{}',
      config: '{}'
    }
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await addMAS({
        name: values.name,
        description: values.description,
        agents: values.agents,
        config: values.config
      });

      toast.success(`Multi-Agent System "${response.name}" created successfully`);

      router.push(routes.workspaces.mas.list(workspaceId));
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to create Multi-Agent System: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(routes.workspaces.details(workspaceId));
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Create Multi‑Agent System"
        description="Create a multi‑agent system for this workspace."
        useBreadcrumbs
        breadcrumbs={breadcrumbs.createMAS(workspaceId, workspaceName)}
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
                    name="name"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter Multi-Agent System name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="agents"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Agents</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Leave empty or enter JSON configuration for agents"
                            className="font-mono text-sm min-h-[100px] resize-y"
                            {...field}
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Config</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Leave empty or enter JSON configuration"
                            className="font-mono text-sm min-h-[100px] resize-y"
                            {...field}
                          />
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
                        <Link href={routes.workspaces.details(workspaceId)}>Cancel</Link>
                      </Button>
                    )}
                    <Button type="submit" variant="sidebar" disabled={isLoading}>
                      {isLoading ? 'Creating...' : 'Create Multi-Agent System'}
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
