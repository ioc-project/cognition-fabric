'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {routes, breadcrumbs} from '@/constants/routes';
import {toast} from 'sonner';
import {useCognitiveAgents} from '@/hooks/useCognitiveAgents';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {CreateCognitiveAgentRequestSchema, type CreateCognitiveAgentRequest} from '@/api/types/cognitive-agent';
import {parseError} from '@/lib/utils';

interface CreateCognitiveAgentFormProps {
  workspaceId: string;
}

export function CreateCognitiveAgentForm({workspaceId}: CreateCognitiveAgentFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || 'Workspace';
  const {addCognitiveAgent} = useCognitiveAgents(workspaceId);

  const form = useForm<CreateCognitiveAgentRequest>({
    resolver: zodResolver(CreateCognitiveAgentRequestSchema),
    defaultValues: {
      cognitive_agent_name: '',
      description: '',
      config: {}
    }
  });

  const onSubmit = async (data: CreateCognitiveAgentRequest) => {
    try {
      setIsSubmitting(true);
      const agent = await addCognitiveAgent(data);
      toast.success(`Cognitive Agent "${data.cognitive_agent_name}" created successfully`);
      router.push(routes.workspaces.cognitiveAgents.details(workspaceId, agent.cognitive_agent_id));
    } catch (err) {
      const errorMessage = parseError(err);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Create Cognitive Agent"
        description="Create a new cognitive agent in this workspace"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.createCognitiveAgent(workspaceId, workspaceName)}
      >
        <div className="flex justify-center">
          <Card className="w-full max-w-4xl">
            <CardContent className="p-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="cognitive_agent_name"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Agent Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Cognitive Agent" {...field} />
                        </FormControl>
                        <FormDescription>A descriptive name for your cognitive agent</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe what this agent does..."
                            className="resize-none"
                            rows={4}
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormDescription>A brief description of the agent's purpose</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-4">
                    <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Creating...' : 'Create Agent'}
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
