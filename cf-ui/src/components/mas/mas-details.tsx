'use client';

import {useEffect} from 'react';
import {useParams, useRouter} from 'next/navigation';
import useSWR from 'swr';
import {masApi, workspaceApi} from '@/api/endpoints';
import type {MAS} from '@/api/types/mas';
import type {Workspace} from '@/api/types/workspace';
import {BasePage} from '@/components/ui/base-page';
import {Card, CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {routes, breadcrumbs} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';

export default function MASDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const rawWorkspaceId = params?.id as string | string[] | undefined;
  const rawMasId = (params as Record<string, string | string[] | undefined>)?.masId;
  const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
  const masId = Array.isArray(rawMasId) ? rawMasId[0] : rawMasId;

  const {
    data: mas,
    error,
    isLoading
  } = useSWR<MAS>(workspaceId && masId ? ['mas-details', workspaceId, masId] : null, () => masApi.get(workspaceId as string, masId as string));
  const {data: workspace} = useSWR<Workspace | null>(workspaceId ? ['workspace', workspaceId] : null, () => workspaceApi.get(workspaceId as string));

  useEffect(() => {
    if (!workspaceId || !masId) {
      router.replace('/not-found');
    }
  }, [workspaceId, masId, router]);

  const crumbs =
    workspace && workspaceId
      ? [
          {link: routes.workspaces.mas.list(workspaceId), text: 'Multi-Agentic Systems'},
          {link: '', text: mas?.name || 'MAS', active: true}
        ]
      : undefined;

  return (
    <BasePage
      title={mas?.name || 'MAS Details'}
      useBreadcrumbs
      breadcrumbs={crumbs || (workspaceId ? breadcrumbs.workspaceMAS(workspaceId, workspace?.name || '') : undefined)}
    >
      <ConditionalSWRRenderer
        data={mas}
        error={error}
        itemName="MAS details"
        customIsLoading={isLoading}
        errorListStateProps={{
          title: 'Failed to load MAS details'
        }}
        emptyListStateProps={{
          title: 'No MAS details found'
        }}
      >
        <div className="flex justify-center py-4">
          <Card variant="list" className="w-full max-w-4xl">
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={mas?.name || ''} disabled readOnly />
                </div>
                <div className="space-y-2">
                  <Label>ID</Label>
                  <Input value={mas?.id || ''} disabled readOnly className="font-mono text-xs" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <Input value={mas?.description || ''} disabled readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Workspace ID</Label>
                  <Input value={mas?.workspace_id || ''} disabled readOnly className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>Created At</Label>
                  <Input
                    value={mas?.created_at ? new Date(mas.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
                    disabled
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>Updated At</Label>
                  <Input
                    value={mas?.updated_at ? new Date(mas.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
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
