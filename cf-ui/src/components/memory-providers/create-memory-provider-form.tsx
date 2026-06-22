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
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {routes} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {BasePage} from '@/components/ui/base-page';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {breadcrumbs} from '@/constants/routes';
import {FormSectionHeader} from '@/components/ui/form-section-header';

const formSchema = z
  .object({
    name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
    description: z.string().optional(),
    url: z.string().min(1, 'URL is required').url('Must be a valid URL'),
    authType: z.enum(['token', 'bearer', 'basic', 'custom', 'none']),
    // Auth credentials - conditionally validated
    token: z.string().optional(),
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    token_type: z.string().optional(),
    expires_at: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    header_name: z.string().optional(),
    header_value: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.authType === 'token') {
        return !!data.token;
      }
      return true;
    },
    {
      message: 'API Key is required for API Key authentication',
      path: ['token']
    }
  )
  .refine(
    (data) => {
      if (data.authType === 'bearer') {
        return !!data.access_token;
      }
      return true;
    },
    {
      message: 'Access token is required for bearer authentication',
      path: ['access_token']
    }
  )
  .refine(
    (data) => {
      if (data.authType === 'basic') {
        return !!data.username && !!data.password;
      }
      return true;
    },
    {
      message: 'Username and password are required for basic authentication',
      path: ['username']
    }
  )
  .refine(
    (data) => {
      if (data.authType === 'custom') {
        return !!data.header_name && !!data.header_value;
      }
      return true;
    },
    {
      message: 'Header name and header value are required for custom authentication',
      path: ['header_name']
    }
  );

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
      name: '',
      description: '',
      url: '',
      authType: 'none',
      token: '',
      access_token: '',
      refresh_token: '',
      token_type: '',
      expires_at: '',
      username: '',
      password: '',
      header_name: '',
      header_value: ''
    }
  });

  const authType = form.watch('authType');

  const handleSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      const auth: any = {
        type: values.authType
      };

      if (values.authType !== 'none') {
        const credentials: any = {};

        if (values.authType === 'token' && values.token) {
          credentials.api_key = values.token;
        } else if (values.authType === 'bearer' && values.access_token) {
          credentials.access_token = values.access_token;
        } else if (values.authType === 'basic') {
          if (values.username) {
            credentials.username = values.username;
          }
          if (values.password) {
            credentials.password = values.password;
          }
        } else if (values.authType === 'custom') {
          if (values.header_name) {
            credentials.header_name = values.header_name;
          }
          if (values.header_value) {
            credentials.header_value = values.header_value;
          }
        }

        auth.credentials = credentials;
      }

      const payload = {
        name: values.name,
        ...(values.description && {description: values.description}),
        config: {
          url: values.url,
          auth
        }
      };

      const response = await addProvider(payload);

      toast.success(`Memory Provider "${response.name}" registered successfully`);

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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col items-start gap-6 w-full max-w-[1100px]" autoComplete="off">
            <input type="text" name="fakeusernameremembered" style={{position: 'absolute', top: '-9999px'}} tabIndex={-1} autoComplete="off" />
            <input
              type="password"
              name="fakepasswordremembered"
              style={{position: 'absolute', top: '-9999px'}}
              tabIndex={-1}
              autoComplete="new-password"
            />

            {error && (
              <div className="w-full p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                {error}
              </div>
            )}

            {/* Basic Information */}
            <Card className="w-full">
              <CardContent className="pt-8 px-8 pb-1">
                <div className="flex flex-col gap-4 mb-6">
                  <FormSectionHeader title="Basic Information" description="Define the core properties of this memory provider" />
                  <div className="flex flex-col gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel required>Provider Name</FormLabel>
                          <FormControl>
                            <Input placeholder="ioc-knowledge-memory-svc" autoComplete="off" {...field} />
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
                            <Textarea placeholder="Optional description of this memory provider" rows={3} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Connection */}
            <Card className="w-full">
              <CardContent className="pt-8 px-8 pb-1">
                <div className="flex flex-col gap-4 mb-6">
                  <FormSectionHeader title="Connection" description="Specify the endpoint for this memory provider" />
                  <FormField
                    control={form.control}
                    name="url"
                    render={({field}) => (
                      <FormItem>
                        <FormLabel required>Provider URL</FormLabel>
                        <FormControl>
                          <Input placeholder="http://localhost:8765" autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Authentication */}
            <Card className="w-full">
              <CardContent className="pt-8 px-8 pb-1">
                <div className="flex flex-col gap-4 mb-6">
                  <FormSectionHeader title="Authentication" description="Configure how requests to this provider are authenticated" />
                  <div className="flex flex-col gap-6">
                    <FormField
                      control={form.control}
                      name="authType"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel required>Authentication Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select authentication type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="token">API Key</SelectItem>
                              <SelectItem value="bearer">Bearer Token</SelectItem>
                              <SelectItem value="basic">Basic Auth</SelectItem>
                              <SelectItem value="custom">Custom Header</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {authType === 'token' && (
                      <FormField
                        control={form.control}
                        name="token"
                        render={({field}) => (
                          <FormItem>
                            <FormLabel required>API Key</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Enter API key" autoComplete="new-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {authType === 'bearer' && (
                      <FormField
                        control={form.control}
                        name="access_token"
                        render={({field}) => (
                          <FormItem>
                            <FormLabel required>Access Token</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Enter access token" autoComplete="new-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {authType === 'basic' && (
                      <>
                        <FormField
                          control={form.control}
                          name="username"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel required>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter username" autoComplete="off" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="password"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel required>Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Enter password" autoComplete="new-password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {authType === 'custom' && (
                      <>
                        <FormField
                          control={form.control}
                          name="header_name"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel required>Header Name</FormLabel>
                              <FormControl>
                                <Input placeholder="X-API-Key" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="header_value"
                          render={({field}) => (
                            <FormItem>
                              <FormLabel required>Header Value</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Enter header value" autoComplete="new-password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3 pt-4 border-t w-full">
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
      </BasePage>
    </div>
  );
}
