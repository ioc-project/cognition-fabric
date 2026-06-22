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
import type {Workspace} from '@/api/types';

const formSchema = z.object({
  name: z.string().min(3, 'Workspace name must be at least 3 characters').optional().nullable(),
  cfn_id: z.string().optional().nullable()
});

type FormValues = z.infer<typeof formSchema>;

interface EditWorkspaceDialogProps {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWorkspaceDialog({workspace, open, onOpenChange}: EditWorkspaceDialogProps) {
  const {data: cfnData, error: cfnError} = useSWR(swrKeys.cfn(), () => cfnApi.list());

  if (cfnError) {
    console.warn('Failed to load CFN list:', cfnError);
  }

  const availableCfns = cfnData?.nodes?.filter((cfn: any) => cfn.enabled) || [];

  const handleSubmit = async (values: FormValues) => {
    const updates: {name?: string | null; cfn_id?: string | null} = {};

    if (values.name !== undefined && values.name !== workspace.name) {
      updates.name = values.name || null;
    }

    if (values.cfn_id !== undefined && values.cfn_id !== workspace.cfn_id) {
      updates.cfn_id = values.cfn_id || null;
    }

    await workspaceApi.update(workspace.id, updates);

    toast.success(`Workspace "${values.name || workspace.name}" updated successfully`);

    await swrMutate(swrKeys.workspaces());
    await swrMutate(swrKeys.workspace(workspace.id));
    await swrMutate(swrKeys.cfn(workspace.id));
    await swrMutate(swrKeys.mas(workspace.id));
    await swrMutate(swrKeys.cognitionEngines());

    onOpenChange(false);
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Workspace"
      description="Update workspace name and Cognition Fabric Node"
      schema={formSchema}
      defaultValues={{
        name: workspace.name,
        cfn_id: workspace.cfn_id || ''
      }}
      onSubmit={handleSubmit}
      submitLabel="Update Workspace"
      loadingLabel="Updating Workspace..."
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
                  <FormLabel>Workspace Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter workspace name" {...field} value={field.value ?? ''} />
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
                  <FormLabel>Cognition Fabric Node</FormLabel>
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
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
        </>
      )}
    </FormModal>
  );
}
