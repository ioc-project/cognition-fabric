// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {z} from 'zod';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {FormModal} from '@/components/ui/form-modal';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {workspaceApi, cfnApi} from '@/api/endpoints';
import useSWR from 'swr';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {toast} from 'sonner';

const formSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').min(3, 'Workspace name must be at least 3 characters'),
  cfn_id: z.string().min(1, 'CFN selection is required'),
  config: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (workspaceId: string) => void;
}

export function CreateWorkspaceDialog({open, onOpenChange, onSuccess}: CreateWorkspaceDialogProps) {
  const {data: cfnData} = useSWR(swrKeys.cfn(), () => cfnApi.list());

  const availableCfns = cfnData?.nodes?.filter((cfn: any) => cfn.enabled) || [];

  const handleSubmit = async (values: FormValues) => {
    let config: Record<string, any> | undefined = undefined;
    if (values.config) {
      try {
        config = JSON.parse(values.config);
      } catch {
        throw new Error('Config must be valid JSON');
      }
    }

    const response = await workspaceApi.create({
      name: values.name,
      cfn_id: values.cfn_id,
      ...(config ? {config} : {})
    });

    toast.success(`Workspace "${values.name}" created successfully`);

    await swrMutate(swrKeys.workspaces());

    onSuccess(response.id);

    void workspaceApi
      .get(response.id)
      .then((workspace) => swrMutate(swrKeys.workspace(response.id), workspace, {revalidate: false}))
      .catch(() => undefined);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Workspace"
      description="Create a new workspace to manage and organize your resources"
      schema={formSchema}
      defaultValues={{name: '', cfn_id: '', config: ''}}
      onSubmit={handleSubmit}
      submitLabel="Create Workspace"
      loadingLabel="Creating Workspace..."
      errorFieldName="name"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel required>Workspace Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter workspace name" {...field} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cfn_id"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel required>Cognition Fabric Node</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a CFN" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableCfns.length === 0 ? (
                        <div className="py-2 px-2 text-sm text-muted-foreground">No Cognition Fabric Nodes available</div>
                      ) : (
                        availableCfns.map((cfn: any) => (
                          <SelectItem key={cfn.id} value={cfn.id}>
                            {cfn.name} ({cfn.status})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="config"
            render={({field}) => (
              <FormItem>
                <div className="space-y-2">
                  <FormLabel>Config (JSON)</FormLabel>
                  <FormControl>
                    <Input placeholder='{"key":"value"}' {...field} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </FormModal>
  );
}
