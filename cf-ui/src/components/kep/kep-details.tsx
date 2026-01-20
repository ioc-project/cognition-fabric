'use client';

import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {BasePage} from '@/components/ui/base-page';
import {useRouter, useParams} from 'next/navigation';
import {useEffect, useState} from 'react';
import {Trash2} from 'lucide-react';
import useSWR from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {kepApi, masApi, workspaceApi} from '@/api/endpoints';
import type {KEP} from '@/api/types/kep';
import type {MAS} from '@/api/types/mas';
import type {Workspace} from '@/api/types/workspace';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {breadcrumbs, routes} from '@/constants/routes';
import {ObjectOptionsDropdown} from '@/components/ui/object-options-dropdown';
import {DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';

export default function KEPDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const rawWorkspaceId = params?.id as string | string[] | undefined;
  const rawKepId = (params as Record<string, string | string[] | undefined>)?.kepId;
  const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
  const kepId = Array.isArray(rawKepId) ? rawKepId[0] : rawKepId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const {
    data: kep,
    error,
    isLoading
  } = useSWR<KEP>(workspaceId && kepId ? swrKeys.kepDetails(workspaceId, kepId) : null, () => kepApi.get(workspaceId as string, kepId as string));
  const {data: masList = [] as MAS[], error: masError} = useSWR<MAS[]>(workspaceId ? swrKeys.mas(workspaceId) : null, () =>
    masApi.list(workspaceId as string)
  );
  const {data: workspace, error: workspaceError} = useSWR<Workspace | null>(workspaceId ? swrKeys.workspace(workspaceId) : null, () =>
    workspaceApi.get(workspaceId as string)
  );

  if (masError) {
    console.warn('Failed to load MAS list:', masError);
  }
  if (workspaceError) {
    console.warn('Failed to load workspace:', workspaceError);
  }

  useEffect(() => {
    if (!workspaceId || !kepId) {
      router.replace('/not-found');
    }
  }, [workspaceId, kepId, router]);

  const connectedMAS = kep ? masList.filter((mas) => kep.mas_ids.includes(mas.id)) : [];

  const breadcrumbItems = workspace && kep && workspaceId ? breadcrumbs.knowledgeDetails(workspaceId, workspace.name, kep.name) : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await kepApi.delete(workspaceId!, data.id);
        toast.success(`Knowledge Adapter "${data.name}" deleted successfully`);
        router.push(routes.workspaces.knowledge.list(workspaceId!));
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  return (
    <>
      <BasePage
        title={kep?.name || 'Knowledge Adapter'}
        description="View details about your knowledge adapter"
        useBreadcrumbs
        breadcrumbs={breadcrumbItems}
        callToAction={
          kep && (
            <ObjectOptionsDropdown objectName={kep.name}>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteDialog.open({id: kep.id, name: kep.name})}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </ObjectOptionsDropdown>
          )
        }
      >
        <ConditionalSWRRenderer
          data={kep}
          error={error}
          customIsLoading={isLoading}
          itemName="Knowledge Adapter details"
          errorListStateProps={{title: 'Failed to load Knowledge Adapter details'}}
          emptyListStateProps={{title: 'No details found'}}
        >
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={kep?.name || ''} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Input value={kep?.type || ''} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Software Type</Label>
                    <Input value={kep?.software_type || ''} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>ID</Label>
                    <Input value={kep?.id || ''} disabled readOnly className="font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Workspace ID</Label>
                    <Input value={kep?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Created At</Label>
                    <Input value={kep?.created_at ? new Date(kep.created_at).toLocaleString() : 'Unknown'} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Updated At</Label>
                    <Input value={kep?.updated_at ? new Date(kep.updated_at).toLocaleString() : 'Unknown'} disabled readOnly />
                  </div>
                </div>

                {connectedMAS.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-sm font-medium text-muted-foreground mb-4">{connectedMAS.length} Connected Multi-Agentic Systems</h3>
                    <div className="space-y-2">
                      {connectedMAS.map((mas: MAS) => (
                        <div key={mas.id} className="p-3 border rounded-md bg-muted/50">
                          <div className="text-sm font-medium">{mas.name || 'Unnamed MAS'}</div>
                          <div className="text-xs text-muted-foreground font-mono">{mas.id}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ConditionalSWRRenderer>
      </BasePage>
      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.close}
        onConfirm={handleDelete}
        title="Delete Knowledge Adapter"
        description={deleteError ?? `Are you sure you want to delete "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
