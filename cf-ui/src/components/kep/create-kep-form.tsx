'use client';

import {z} from 'zod';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {useMemo, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/components/ui/select';
import {MultiSelect} from '@/components/ui/multi-select';
import {masApi, softwareApi} from '@/api/endpoints';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import useSWR from 'swr';
import {BasePage} from '@/components/ui/base-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {breadcrumbs} from '@/constants/routes';
import {useKEPs} from '@/hooks/useApi';

const formSchema = z.object({
  name: z.string().min(1, 'Knowledge Adapter name is required').min(3, 'Name must be at least 3 characters'),
  mas_ids: z.array(z.string().uuid()).min(1, 'Select at least one MAS'),
  type: z.enum(['pull', 'push', 'both']),
  software_type: z.enum(['info-extraction', 'otel']),
  software_config: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') {
        return {};
      }
      try {
        return JSON.parse(val);
      } catch {
        throw new Error('Invalid JSON format for software_config');
      }
    })
});

export type FormValues = z.infer<typeof formSchema>;

interface CreateKEPFormProps {
  workspaceId: string;
  onCancel?: () => void;
}

export function CreateKEPForm({workspaceId, onCancel}: CreateKEPFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || 'Workspace';
  const {addKEP} = useKEPs(workspaceId);

  const {data: masList = []} = useSWR(['mas-list', workspaceId], () => masApi.list(workspaceId));
  const {data: softwareTemplates = []} = useSWR('software-templates-all', () => softwareApi.listAll());

  const availableSoftwareTypes = useMemo(() => {
    const types = new Set<string>();
    softwareTemplates.forEach((t) => {
      const cfg = t.config || ({} as Record<string, unknown>);
      if (Object.prototype.hasOwnProperty.call(cfg, 'info-extraction')) {
        types.add('info-extraction');
      }
      if (Object.prototype.hasOwnProperty.call(cfg, 'otel')) {
        types.add('otel');
      }
    });
    return (types.size ? Array.from(types) : ['info-extraction', 'otel']) as Array<'info-extraction' | 'otel'>;
  }, [softwareTemplates]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      mas_ids: [],
      type: 'pull',
      software_type: availableSoftwareTypes[0] ?? 'info-extraction',
      software_config: '{}'
    }
  });

  const masOptions = useMemo(() => masList.map((m) => ({label: m.name, value: m.id})), [masList]);

  const handleSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      await addKEP({
        name: values.name,
        mas_ids: values.mas_ids,
        type: values.type,
        software_type: values.software_type,
        software_config: values.software_config
      });

      toast.success(`Knowledge Adapter "${values.name}" created successfully`);

      router.push(routes.workspaces.knowledge.list(workspaceId));
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to create Knowledge Adapter: ${errorMessage}`);
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
      <BasePage title="Create Knowledge Adapter" useBreadcrumbs breadcrumbs={breadcrumbs.createKnowledge(workspaceId, workspaceName)}>
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
                        <FormLabel>Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter Knowledge Adapter name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mas_ids"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Connect to MAS *</FormLabel>
                        <FormControl>
                          <MultiSelect
                            placeholder={masOptions.length ? 'Select one or more MAS' : 'No MAS available in this workspace'}
                            value={field.value}
                            onChange={field.onChange}
                            options={masOptions}
                            disabled={!masOptions.length}
                            align="start"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel>Type *</FormLabel>
                          <FormControl>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent align="start" className="text-popover-foreground">
                                <SelectItem value="pull">pull</SelectItem>
                                <SelectItem value="push">push</SelectItem>
                                <SelectItem value="both">both</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="software_type"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel>Software Type *</FormLabel>
                          <FormControl>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select software type" />
                              </SelectTrigger>
                              <SelectContent align="start" className="text-popover-foreground">
                                {availableSoftwareTypes.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="software_config"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Software Config</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Leave empty or enter JSON configuration"
                            className="font-mono text-sm min-h-[100px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <div className="text-xs text-muted-foreground">Enter configuration as JSON (optional, defaults to empty object)</div>
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
                    <Button type="submit" variant="sidebar" disabled={isLoading || !masOptions.length}>
                      {isLoading ? 'Creating...' : 'Create Knowledge Adapter'}
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
