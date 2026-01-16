'use client';

import {useEffect} from 'react';
import {useParams, useRouter} from 'next/navigation';
import useSWR from 'swr';
import {swrKeys} from '@/lib/swr-config';
import {reasonerApi, masApi, workspaceApi} from '@/api/endpoints';
import type {Reasoner} from '@/api/types/reasoner';
import type {MAS} from '@/api/types/mas';
import type {Workspace} from '@/api/types/workspace';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {ReasonerQuery} from '@/components/reasoners/reasoner-query';

export default function ReasonerDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const rawWorkspaceId = params?.id as string | string[] | undefined;
  const rawReasonerId = (params as Record<string, string | string[] | undefined>)?.reasonerId;
  const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
  const reasonerId = Array.isArray(rawReasonerId) ? rawReasonerId[0] : rawReasonerId;

  const {
    data: reasoner,
    error,
    isLoading
  } = useSWR<Reasoner>(workspaceId && reasonerId ? swrKeys.reasonerDetails(workspaceId, reasonerId) : null, () =>
    reasonerApi.get(workspaceId as string, reasonerId as string)
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
    if (!workspaceId || !reasonerId) {
      router.replace('/not-found');
    }
  }, [workspaceId, reasonerId, router]);

  const masName = reasoner ? masList.find((m) => m.id === reasoner.mas_id)?.name || reasoner.mas_id : '';
  const crumbs =
    workspace && workspaceId
      ? [
          {link: routes.workspaces.reasoners.list(workspaceId), text: 'Reasoners'},
          {link: '', text: reasoner?.name || 'Reasoner', active: true}
        ]
      : undefined;

  return (
    <BasePage
      title={reasoner?.name || 'Reasoner'}
      description={reasonerId ? `View details for reasoner ${reasonerId}` : undefined}
      useBreadcrumbs
      breadcrumbs={crumbs}
    >
      <ConditionalSWRRenderer
        data={reasoner}
        error={error}
        customIsLoading={isLoading}
        itemName="Reasoner details"
        errorListStateProps={{title: 'Failed to load Reasoner details'}}
        emptyListStateProps={{title: 'No details found'}}
      >
        {workspaceId && reasonerId && <ReasonerQuery workspaceId={workspaceId} reasonerId={reasonerId} />}
        <div className="flex justify-center py-4">
          <Card variant="list" className="w-full max-w-4xl">
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={reasoner?.name || ''} disabled readOnly />
                </div>
                <div className="space-y-2">
                  <Label>MAS</Label>
                  <Input value={masName || ''} disabled readOnly />
                </div>
                <div className="space-y-2">
                  <Label>ID</Label>
                  <Input value={reasoner?.id || ''} disabled readOnly className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>Workspace ID</Label>
                  <Input value={reasoner?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>Created At</Label>
                  <Input
                    value={reasoner?.created_at ? new Date(reasoner.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
                    disabled
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>Updated At</Label>
                  <Input
                    value={reasoner?.updated_at ? new Date(reasoner.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
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
  );
}
