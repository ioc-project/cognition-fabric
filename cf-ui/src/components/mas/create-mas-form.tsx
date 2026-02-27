'use client';

import {z} from 'zod';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useForm, useFieldArray} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {BasePage} from '@/components/ui/base-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {breadcrumbs} from '@/constants/routes';
import {useMAS} from '@/hooks/useMAS';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {AgentsList} from './agents-list';
import {CollapsibleJsonField} from './collapsible-json-field';

const AgentFormSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required'),
  agentic_memory_provider_id: z.string().optional()
});

const formSchema = z.object({
  name: z.string().min(1, 'Multi-Agent System name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  shared_memory_provider_id: z.string().optional(),
  agents: z.array(AgentFormSchema).optional().default([]),
  config: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') {
          return true;
        }
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      {message: 'Invalid JSON format for config'}
    )
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
  const [masConfigExpanded, setMasConfigExpanded] = useState(true);
  const [agentExpandedState, setAgentExpandedState] = useState<Record<string, boolean>>({});
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || 'Workspace';
  const {addMAS} = useMAS(workspaceId);
  const {providers} = useMemoryProviders();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      shared_memory_provider_id: '',
      agents: [],
      config: ''
    }
  });

  const userMemoryProviders = providers || [];

  const {
    fields: agentFields,
    append: appendAgent,
    remove: removeAgent
  } = useFieldArray({
    control: form.control,
    name: 'agents'
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      const parseJsonField = (value?: string): Record<string, unknown> | undefined => {
        if (!value || value.trim() === '') {
          return undefined;
        }
        return JSON.parse(value) as Record<string, unknown>;
      };

      const agentsPayload = (values.agents || []).map((agent) => ({
        agent_id: agent.agent_id,
        ...(agent.agentic_memory_provider_id && {agentic_memory_provider_id: agent.agentic_memory_provider_id})
      }));

      const response = await addMAS({
        name: values.name,
        description: values.description,
        ...(values.shared_memory_provider_id && {shared_memory_provider_id: values.shared_memory_provider_id}),
        ...(agentsPayload.length > 0 && {agents: agentsPayload}),
        ...(values.config && {config: parseJsonField(values.config)})
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
                <form
                  onSubmit={(e) => {
                    void form.handleSubmit(handleSubmit)(e);
                  }}
                  className="space-y-6"
                >
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
                    name="shared_memory_provider_id"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Shared Memory Provider</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a memory provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {userMemoryProviders.length === 0 ? (
                              <div className="py-2 px-2 text-sm text-muted-foreground">No shared memory providers available</div>
                            ) : (
                              userMemoryProviders.map((provider) => (
                                <SelectItem key={provider.memory_provider_id} value={provider.memory_provider_id}>
                                  {provider.memory_provider_name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <AgentsList
                    agents={agentFields}
                    control={form.control}
                    watch={form.watch}
                    isEditMode={true}
                    agentExpandedState={agentExpandedState}
                    onToggleExpand={(id) => setAgentExpandedState((prev) => ({...prev, [id]: !(prev[id] ?? true)}))}
                    onAddAgent={() => appendAgent({agent_id: '', agentic_memory_provider_id: ''})}
                    onRemoveAgent={removeAgent}
                    userMemoryProviders={userMemoryProviders.map((p) => ({id: p.memory_provider_id, provider_name: p.memory_provider_name}))}
                  />

                  <div className="space-y-4 border-t pt-6">
                    <FormField
                      control={form.control}
                      name="config"
                      render={({field}) => (
                        <CollapsibleJsonField
                          label="Config"
                          value={field.value || ''}
                          isExpanded={masConfigExpanded}
                          onToggleExpand={() => setMasConfigExpanded(!masConfigExpanded)}
                          isEditMode={true}
                          field={field}
                          placeholder={`{
  "key": "value"
}`}
                        />
                      )}
                    />
                  </div>

                  <div className="flex w-full items-center justify-between pt-4 border-t">
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
