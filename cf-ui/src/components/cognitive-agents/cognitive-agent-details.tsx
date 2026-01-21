'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter} from 'next/navigation';
import useSWR from 'swr';
import {Trash2} from 'lucide-react';
import {swrKeys} from '@/lib/swr-config';
import {reasonerApi, masApi, workspaceApi} from '@/api/endpoints';
import type {CognitiveAgent} from '@/api/types/cognitive-agent';
import type {MAS} from '@/api/types/mas';
import type {Workspace} from '@/api/types/workspace';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS, parseError} from '@/lib/utils';
import {CognitiveAgentQuery} from '@/components/cognitive-agents/cognitive-agent-query';
import {ObjectOptionsDropdown} from '@/components/ui/object-options-dropdown';
import {DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {toast} from 'sonner';

export default function CognitiveAgentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const rawWorkspaceId = params?.id as string | string[] | undefined;
  const rawCognitiveAgentId = (params as Record<string, string | string[] | undefined>)?.cognitiveAgentId;
  const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
  const cognitiveAgentId = Array.isArray(rawCognitiveAgentId) ? rawCognitiveAgentId[0] : rawCognitiveAgentId;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();

  const {
    data: cognitiveAgent,
    error,
    isLoading
  } = useSWR<CognitiveAgent>(workspaceId && cognitiveAgentId ? swrKeys.cognitiveAgentDetails(workspaceId, cognitiveAgentId) : null, () =>
    reasonerApi.get(workspaceId as string, cognitiveAgentId as string)
  );
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
    if (!workspaceId || !cognitiveAgentId) {
      router.replace('/not-found');
    }
  }, [workspaceId, cognitiveAgentId, router]);

  const masName = cognitiveAgent ? masList.find((m) => m.id === cognitiveAgent.mas_id)?.name || cognitiveAgent.mas_id : '';
  const crumbs =
    workspace && workspaceId
      ? [
          {link: routes.workspaces.cognitiveAgents.list(workspaceId), text: 'Cognitive Agents'},
          {link: '', text: cognitiveAgent?.name || 'Cognitive Agent', active: true}
        ]
      : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await reasonerApi.delete(workspaceId!, data.id);
        toast.success(`Cognitive Agent "${data.name}" deleted successfully`);
        router.push(routes.workspaces.cognitiveAgents.list(workspaceId!));
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
        title={cognitiveAgent?.name || 'Cognitive Agent'}
        description="View details about your cognitive agent"
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          cognitiveAgent && (
            <ObjectOptionsDropdown objectName={cognitiveAgent.name}>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deleteDialog.open({id: cognitiveAgent.id, name: cognitiveAgent.name})}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </ObjectOptionsDropdown>
          )
        }
      >
        <ConditionalSWRRenderer
          data={cognitiveAgent}
          error={error}
          customIsLoading={isLoading}
          itemName="Cognitive Agent details"
          errorListStateProps={{title: 'Failed to load Cognitive Agent details'}}
          emptyListStateProps={{title: 'No details found'}}
        >
          {workspaceId && cognitiveAgentId && <CognitiveAgentQuery workspaceId={workspaceId} cognitiveAgentId={cognitiveAgentId} />}
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={cognitiveAgent?.name || ''} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>MAS</Label>
                    <Input value={masName || ''} disabled readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>ID</Label>
                    <Input value={cognitiveAgent?.id || ''} disabled readOnly className="font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Workspace ID</Label>
                    <Input value={cognitiveAgent?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Created At</Label>
                    <Input
                      value={
                        cognitiveAgent?.created_at ? new Date(cognitiveAgent.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'
                      }
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Updated At</Label>
                    <Input
                      value={
                        cognitiveAgent?.updated_at ? new Date(cognitiveAgent.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'
                      }
                      disabled
                      readOnly
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ConditionalSWRRenderer>
      </BasePage>
      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.close}
        onConfirm={handleDelete}
        title="Delete Cognitive Agent"
        description={deleteError ?? `Are you sure you want to delete "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
