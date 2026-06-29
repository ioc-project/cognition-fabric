// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

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
import {routes, breadcrumbs} from '@/constants/routes';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {BasePage} from '@/components/ui/base-page';
import {useCfn} from '@/hooks/useCfn';
import {FormSectionHeader} from '@/components/ui/form-section-header';

const formSchema = z.object({
  name: z.string().min(1, 'CFN Name is required').min(3, 'CFN Name must be at least 3 characters'),
  ip_address: z.string().min(1, 'IP Address is required'),
  port: z
    .string()
    .min(1, 'Port is required')
    .refine(
      (val) => {
        const num = parseInt(val, 10);
        return !isNaN(num) && num > 0 && num <= 65535;
      },
      {message: 'Port must be a number between 1 and 65535'}
    )
});

type FormValues = z.infer<typeof formSchema>;

interface CreateCfnFormProps {
  onCancel?: () => void;
}

export function CreateCfnForm({onCancel}: CreateCfnFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {addCfn} = useCfn();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      ip_address: '',
      port: ''
    }
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await addCfn({
        name: values.name,
        ip_address: values.ip_address,
        port: parseInt(values.port, 10)
      });

      toast.success(`Cognition Fabric Node "${response.name}" registered successfully`);

      router.push(routes.cfn.list);
    } catch (err) {
      const errorMessage = parseError(err);
      setError(errorMessage);
      toast.error(`Failed to register Cognition Fabric Node: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(routes.cfn.list);
    }
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Register Cognition Fabric Node"
        description="Register a Cognition Fabric Node."
        useBreadcrumbs
        breadcrumbs={breadcrumbs.createCfn()}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col items-start gap-6 w-full max-w-[1100px]">
            {error && (
              <div className="w-full p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                {error}
              </div>
            )}

            <Card className="w-full">
              <CardContent className="pt-8 px-8 pb-1">
                <div className="flex flex-col gap-4 mb-6">
                  <FormSectionHeader title="Basic Information" description="Define the name for this Cognition Fabric Node" />
                  <FormField
                    control={form.control}
                    name="name"
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
                </div>
              </CardContent>
            </Card>

            <Card className="w-full">
              <CardContent className="pt-8 px-8 pb-1">
                <div className="flex flex-col gap-4 mb-6">
                  <FormSectionHeader title="Connection" description="Specify the network address for this node" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="ip_address"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel required>IP Address</FormLabel>
                          <FormControl>
                            <Input placeholder="192.168.1.100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="port"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel required>Port</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="8080" {...field} />
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
              {onCancel ? (
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
                  Cancel
                </Button>
              ) : (
                <Button asChild type="button" variant="outline" disabled={isLoading}>
                  <Link href={routes.cfn.list}>Cancel</Link>
                </Button>
              )}
              <Button type="submit" variant="sidebar" disabled={isLoading}>
                {isLoading ? 'Registering...' : 'Register Cognition Fabric Node'}
              </Button>
            </div>
          </form>
        </Form>
      </BasePage>
    </div>
  );
}
