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
import {FormSectionHeader} from '@/components/ui/form-section-header';

const createCognitiveAgentSchema = z.object({
  cognitive_agent_name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional()
});

type CreateCognitiveAgentFormData = z.infer<typeof createCognitiveAgentSchema>;

interface CreateCognitiveAgentFormProps {
  workspaceId: string;
}

export function CreateCognitiveAgentForm({workspaceId: _workspaceId}: CreateCognitiveAgentFormProps) {
  const _router = useRouter();
  const [_isLoading, _setIsLoading] = useState(false);
  const [_error, _setError] = useState<string | null>(null);
  // NOTE: Cognition engines cannot be created via UI
  // const {addCognitionEngine} = useCognitionEngines();

  const form = useForm<CreateCognitiveAgentFormData>({
    resolver: zodResolver(createCognitiveAgentSchema),
    defaultValues: {
      cognitive_agent_name: '',
      description: '',
      config: {}
    }
  });

  const onSubmit = async (_data: CreateCognitiveAgentFormData) => {
    // NOTE: Cognition engines cannot be created via UI
    toast.error('Cognition engines cannot be created through the UI');
    return;

    /* try {
      setIsLoading(true);
      setError(null);
      await addCognitiveAgent(data);
      toast.success(`Cognition Engine "${data.cognitive_agent_name}" created successfully`);
      router.push(routes.cognitiveAgents.list);
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to register Cognition Engine: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    } */
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Register Cognition Engine"
        description="Register a new cognition engine in this workspace"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.cognitiveAgentCreate()}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col items-start gap-6 w-full max-w-[1100px]">
            {_error && (
              <div className="w-full p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                {_error}
              </div>
            )}

            <Card className="w-full">
              <CardContent className="pt-8 px-8 pb-1">
                <div className="flex flex-col gap-4 mb-6">
                  <FormSectionHeader title="Basic Information" description="Define the core properties of this cognition engine" />
                  <div className="flex flex-col gap-6">
                    <FormField
                      control={form.control}
                      name="cognitive_agent_name"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel required>Agent Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My Cognition Engine" {...field} />
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
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3 pt-4 border-t w-full">
              <Button asChild type="button" variant="outline" disabled={_isLoading}>
                <Link href={routes.cognitiveAgents.list}>Cancel</Link>
              </Button>
              <Button type="submit" variant="sidebar" disabled={_isLoading}>
                {_isLoading ? 'Creating...' : 'Create Cognition Engine'}
              </Button>
            </div>
          </form>
        </Form>
      </BasePage>
    </div>
  );
}
