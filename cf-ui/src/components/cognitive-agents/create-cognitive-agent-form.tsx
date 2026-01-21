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
import {masApi} from '@/api/endpoints';
import {swrKeys} from '@/lib/swr-config';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import type {CreateCognitiveAgentRequest} from '@/api/types/cognitive-agent';
import useSWR from 'swr';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useCognitiveAgents} from '@/hooks/useApi';
import {BasePage} from '@/components/ui/base-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {breadcrumbs} from '@/constants/routes';

const formSchema = z.object({
  name: z.string().min(1, 'Cognitive Agent name is required').min(3, 'Name must be at least 3 characters'),
  mas_id: z.string().uuid('Select a valid MAS'),
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

export function CreateCognitiveAgentForm({workspaceId}: {workspaceId: string}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || 'Workspace';

  const {data: masList = [], error: masError} = useSWR(swrKeys.mas(workspaceId), () => masApi.list(workspaceId));
  const {addCognitiveAgent} = useCognitiveAgents(workspaceId);

  if (masError) {
    console.warn('Failed to load MAS list:', masError);
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      mas_id: '',
      config: ''
    }
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setError(null);
    try {
      const payload: CreateCognitiveAgentRequest = {
        name: values.name,
        mas_id: values.mas_id,
        config: values.config
      };
      await addCognitiveAgent(payload);
      toast.success(`Cognitive Agent "${values.name}" created successfully`);
      router.push(routes.workspaces.cognitiveAgents.list(workspaceId));
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to create Cognitive Agent: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Create Cognitive Agent"
        description="Create a cognitive agent for your multi-agent system"
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
                    name="name"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter Cognitive Agent name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mas_id"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Multi‑Agentic System (MAS)</FormLabel>
                        <FormControl>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder={masList.length ? 'Select a MAS' : 'No MAS available in this workspace'} />
                            </SelectTrigger>
                            <SelectContent align="start" className="text-popover-foreground">
                              {masList.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                        <FormLabel>Configuration (JSON)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Optional JSON configuration" className="font-mono text-sm min-h-[220px] resize-y" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex w-full items-center justify-between pt-4">
                    <Button asChild type="button" variant="outline" disabled={isLoading}>
                      <Link href={routes.workspaces.details(workspaceId)}>Cancel</Link>
                    </Button>
                    <Button type="submit" variant="sidebar" disabled={isLoading || masList.length === 0}>
                      {isLoading ? 'Creating...' : 'Create Cognitive Agent'}
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
