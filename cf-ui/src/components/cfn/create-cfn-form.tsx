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
import {parseError, formatJson} from '@/lib/utils';
import {toast} from 'sonner';
import {BasePage} from '@/components/ui/base-page';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {useCfn} from '@/hooks/useCfn';
import {breadcrumbs} from '@/constants/routes';

const formSchema = z.object({
  cfn_id: z.string().min(1, 'CFN ID is required'),
  cfn_name: z.string().min(1, 'CFN Name is required').min(3, 'CFN Name must be at least 3 characters'),
  cfn_config: z
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

interface CreateCfnFormProps {
  workspaceId: string;
  onCancel?: () => void;
}

export function CreateCfnForm({workspaceId, onCancel}: CreateCfnFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name || 'Workspace';
  const {addCfn} = useCfn(workspaceId);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cfn_id: '',
      cfn_name: '',
      cfn_config: ''
    }
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      let cfn_config: Record<string, unknown> | undefined;
      if (values.cfn_config && values.cfn_config.trim() !== '') {
        try {
          cfn_config = JSON.parse(values.cfn_config);
        } catch {
          throw new Error('Invalid JSON format for config');
        }
      }

      const response = await addCfn({
        cfn_id: values.cfn_id,
        cfn_name: values.cfn_name,
        cfn_config
      });

      toast.success(`Cognitive Fabric Node "${response.cfn_name}" created successfully`);

      router.push(routes.workspaces.cfn.list(workspaceId));
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to create Cognitive Fabric Node: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(routes.workspaces.cfn.list(workspaceId));
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Create Cognitive Fabric Node"
        description="Register a new Cognitive Fabric Node for this workspace."
        useBreadcrumbs
        breadcrumbs={breadcrumbs.createCfn(workspaceId, workspaceName)}
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
                    name="cfn_id"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>CFN ID</FormLabel>
                        <FormControl>
                          <Input placeholder="cfn-prod-us-east-1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cfn_name"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>CFN Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Production CFN - US East" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cfn_config"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel>Configuration (JSON)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder='{"max_connections": 100, "memory_limit": "4GB"}'
                            className="font-mono text-sm min-h-[150px] resize-y"
                            {...field}
                            onBlur={() => field.onChange(formatJson(field.value || ''))}
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
                        <Link href={routes.workspaces.cfn.list(workspaceId)}>Cancel</Link>
                      </Button>
                    )}
                    <Button type="submit" variant="sidebar" disabled={isLoading}>
                      {isLoading ? 'Creating...' : 'Create Cognitive Fabric Node'}
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
