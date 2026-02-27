'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {routes, breadcrumbs} from '@/constants/routes';
import {toast} from 'sonner';
import {useCognitiveAgents} from '@/hooks/useCognitiveAgents';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {parseError} from '@/lib/utils';

const createCognitiveAgentSchema = z.object({
  cognitive_agent_name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional()
});

type CreateCognitiveAgentFormData = z.infer<typeof createCognitiveAgentSchema>;

interface CreateCognitiveAgentFormProps {
  workspaceId: string;
}

export function CreateCognitiveAgentForm({workspaceId}: CreateCognitiveAgentFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || 'Workspace';
  const {addCognitiveAgent} = useCognitiveAgents(workspaceId);

  const form = useForm<CreateCognitiveAgentFormData>({
    resolver: zodResolver(createCognitiveAgentSchema),
    defaultValues: {
      cognitive_agent_name: '',
      description: '',
      config: {}
    }
  });

  const onSubmit = async (data: CreateCognitiveAgentFormData) => {
    try {
      setIsLoading(true);
      setError(null);
      await addCognitiveAgent(data);
      toast.success(`Cognition Agent "${data.cognitive_agent_name}" created successfully`);
      router.push(routes.workspaces.cognitiveAgents.list(workspaceId));
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to create Cognition Agent: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Create Cognition Agent"
        description="Create a new cognition agent in this workspace"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.createCognitiveAgent(workspaceId, workspaceName)}
      >
        <div className="flex justify-center">
          <Card className="w-full max-w-4xl">
            <CardContent className="p-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {error && (
                    <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                      {error}
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="cognitive_agent_name"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>Agent Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Cognition Agent" {...field} />
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
                          <Textarea
                            placeholder="Describe what this agent does..."
                            className="resize-none"
                            rows={4}
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex w-full items-center justify-between pt-4">
                    <Button asChild type="button" variant="outline" disabled={isLoading}>
                      <Link href={routes.workspaces.cognitiveAgents.list(workspaceId)}>Cancel</Link>
                    </Button>
                    <Button type="submit" variant="sidebar" disabled={isLoading}>
                      {isLoading ? 'Creating...' : 'Create Cognition Agent'}
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
