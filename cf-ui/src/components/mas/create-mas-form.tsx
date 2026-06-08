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
import {breadcrumbs} from '@/constants/routes';
import {useMAS} from '@/hooks/useMAS';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {MultiSelect} from '@/components/ui/multi-select';
import {AgentsList} from './agents-list';
import {CollapsibleJsonField} from './collapsible-json-field';

const AgentFormSchema = z.object({
  name: z.string().optional(),
  url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  agentic_memory_provider_id: z.string().optional(),
  identity_type: z.string().optional(),
  identity_identifiers: z
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
      {message: 'Must be valid JSON'}
    )
});

const formSchema = z
  .object({
    name: z.string().min(1, 'Multi-Agent System name is required').min(3, 'Name must be at least 3 characters'),
    description: z.string().optional(),
    shared_memory_provider_id: z.string().optional(),
    cognition_engine_ids: z.array(z.string()).optional().default([]),
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
  })
  .superRefine((data, ctx) => {
    const names: string[] = [];
    (data.agents || []).forEach((agent, index) => {
      const trimmed = agent.name?.trim();
      if (trimmed) {
        if (names.includes(trimmed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Agent name "${trimmed}" already exists in this system`,
            path: ['agents', index, 'name']
          });
        }
        names.push(trimmed);
      }
    });
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
  const {addMAS} = useMAS(workspaceId);
  const {providers} = useMemoryProviders();
  const {cognitionEngines = []} = useCognitionEngines();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      shared_memory_provider_id: '',
      cognition_engine_ids: [],
      agents: [],
      config: ''
    }
  });

  const userMemoryProviders = providers || [];

  const sharedMemoryProviders = userMemoryProviders.filter((p) => p.name === 'ioc-memory-provider');

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

      const agentsPayload = (values.agents || [])
        .filter((agent) => agent.name?.trim())
        .map((agent) => ({
          name: agent.name!.trim(),
          ...(agent.url?.trim() && {url: agent.url.trim()}),
          ...(agent.agentic_memory_provider_id && {agentic_memory_provider_id: agent.agentic_memory_provider_id}),
          ...(agent.identity_type?.trim() && {
            identity: {
              type: agent.identity_type.trim(),
              identifiers: agent.identity_identifiers?.trim() ? JSON.parse(agent.identity_identifiers) : {}
            }
          })
        }));

      const response = await addMAS({
        name: values.name,
        description: values.description,
        ...(values.shared_memory_provider_id && {shared_memory_provider_id: values.shared_memory_provider_id}),
        ...(values.cognition_engine_ids && values.cognition_engine_ids.length > 0 && {cognition_engine_ids: values.cognition_engine_ids}),
        ...(agentsPayload.length > 0 && {agents: agentsPayload}),
        ...(values.config && {config: parseJsonField(values.config)})
      });

      toast.success(`Multi-Agent System "${response.name}" created successfully`);

      router.push(routes.mas.list);
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
      router.push(routes.mas.list);
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Create Multi‑Agent System"
        description="Create a multi‑agent system for this workspace."
        useBreadcrumbs
        breadcrumbs={breadcrumbs.masCreate()}
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
                            {sharedMemoryProviders.length === 0 ? (
                              <div className="py-2 px-2 text-sm text-muted-foreground">No shared memory providers available</div>
                            ) : (
                              sharedMemoryProviders.map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>
                                  {provider.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cognition_engine_ids"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Cognition Engines</FormLabel>
                        <FormControl>
                          <MultiSelect
                            value={field.value ?? []}
                            options={cognitionEngines.map((ce) => ({
                              label: ce.name,
                              value: ce.id,
                              disabled: ce.mas_auto_associate ?? false,
                              hint: ce.mas_auto_associate ? 'Automatically attached to this MAS at creation.' : undefined
                            }))}
                            placeholder="Select cognition engines"
                            emptyMessage="No cognition engines available"
                            onChange={field.onChange}
                          />
                        </FormControl>
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
                    onAddAgent={() => appendAgent({name: '', url: '', agentic_memory_provider_id: '', identity_type: '', identity_identifiers: ''})}
                    onRemoveAgent={removeAgent}
                    userMemoryProviders={userMemoryProviders.map((p) => ({id: p.id, provider_name: p.name}))}
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
