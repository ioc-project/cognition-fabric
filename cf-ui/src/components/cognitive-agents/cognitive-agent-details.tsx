'use client';

import {useEffect, useState} from 'react';
import {useParams, useRouter} from 'next/navigation';
import useSWR from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {cognitiveAgentApi} from '@/api/endpoints/cognitive-agent';
import {workspaceApi} from '@/api/endpoints';
import type {CognitiveAgent} from '@/api/types/cognitive-agent';
import type {Workspace} from '@/api/types/workspace';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS, parseError} from '@/lib/utils';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {DetailsPageActions} from '@/components/ui/details-page-actions';
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
    cognitiveAgentApi.get(workspaceId as string, cognitiveAgentId as string)
  );

  const {data: workspace, error: workspaceError} = useSWR<Workspace | null>(workspaceId ? swrKeys.workspace(workspaceId) : null, () =>
    workspaceApi.get(workspaceId as string)
  );

  if (workspaceError) {
    console.warn('Failed to load workspace:', workspaceError);
  }

  useEffect(() => {
    if (!workspaceId || !cognitiveAgentId) {
      router.replace('/not-found');
    }
  }, [workspaceId, cognitiveAgentId, router]);

  const crumbs =
    workspace && workspaceId
      ? [
          {link: routes.workspaces.cognitiveAgents.list(workspaceId), text: 'Cognition Agents'},
          {link: '', text: cognitiveAgent?.cognitive_agent_name || 'Cognition Agent', active: true}
        ]
      : undefined;

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await cognitiveAgentApi.delete(workspaceId!, data.id);
        toast.success(`Cognition Agent "${data.name}" deleted successfully`);
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
        title={cognitiveAgent?.cognitive_agent_name || 'Cognition Agent'}
        description="View details about your cognition agent"
        useBreadcrumbs
        breadcrumbs={crumbs}
        callToAction={
          cognitiveAgent ? (
            <DetailsPageActions
              onDelete={() => deleteDialog.open({id: cognitiveAgent.cognitive_agent_id, name: cognitiveAgent.cognitive_agent_name})}
            />
          ) : undefined
        }
      >
        <ConditionalSWRRenderer
          data={cognitiveAgent}
          error={error}
          customIsLoading={isLoading}
          itemName="Cognition Agent details"
          errorListStateProps={{title: 'Failed to load Cognition Agent details'}}
          emptyListStateProps={{title: 'No details found'}}
        >
          <div className="flex justify-center py-4">
            <Card variant="list" className="w-full max-w-4xl">
              <CardContent className="p-8">
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Agent Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Agent ID</Label>
                        <Input value={cognitiveAgent?.cognitive_agent_id || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={cognitiveAgent?.cognitive_agent_name || ''} disabled readOnly />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Description</Label>
                        <Textarea value={cognitiveAgent?.description || 'N/A'} disabled readOnly className="resize-none" rows={2} />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Input value={cognitiveAgent?.enabled ? 'Enabled' : 'Disabled'} disabled readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Workspace ID</Label>
                        <Input value={cognitiveAgent?.workspace_id || workspaceId || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* Configuration */}
                  {cognitiveAgent?.config && Object.keys(cognitiveAgent.config).length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Configuration</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries(cognitiveAgent.config).map(([key, value]) => {
                          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                            return (
                              <div key={key} className="space-y-2 md:col-span-2">
                                <Label className="capitalize">{key.replace(/_/g, ' ')}</Label>
                                <Textarea
                                  value={JSON.stringify(value, null, 2)}
                                  disabled
                                  readOnly
                                  className="font-mono text-sm min-h-[100px] resize-none"
                                />
                              </div>
                            );
                          }

                          return (
                            <div key={key} className="space-y-2">
                              <Label className="capitalize">{key.replace(/_/g, ' ')}</Label>
                              <Input
                                value={typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                                disabled
                                readOnly
                                className={typeof value === 'string' && value.length > 50 ? 'font-mono text-xs' : ''}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Created At</Label>
                        <Input
                          value={
                            cognitiveAgent?.created_at
                              ? new Date(cognitiveAgent.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)
                              : 'Unknown'
                          }
                          disabled
                          readOnly
                        />
                      </div>
                      {/* <div className="space-y-2">
                        <Label>Updated At</Label>
                        <Input
                          value={
                            cognitiveAgent?.updated_at
                              ? new Date(cognitiveAgent.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)
                              : 'Unknown'
                          }
                          disabled
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Created By</Label>
                        <Input value={cognitiveAgent?.created_by || ''} disabled readOnly className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <Label>Updated By</Label>
                        <Input value={cognitiveAgent?.updated_by || 'N/A'} disabled readOnly className="font-mono text-xs" />
                      </div> */}
                    </div>
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
        title="Delete Cognition Agent"
        description={deleteError ?? `Are you sure you want to delete "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleteDialog.isLoading}
      />
    </>
  );
}
