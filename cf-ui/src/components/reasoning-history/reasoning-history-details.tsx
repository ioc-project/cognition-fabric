'use client';

import {useMemo, useState} from 'react';
import {useParams} from 'next/navigation';
import {BasePage} from '@/components/ui/base-page';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {breadcrumbs} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {useSWRResource} from '@/hooks/useSWRResource';
import {swrKeys} from '@/lib/swr-config';
import {ReasoningHistoryViewer, ViewMode} from './reasoning-history-viewer';
import {reasoningHistoryApi} from '@/api/endpoints/reasoning-history';
import type {ReasoningHistoryResponse} from '@/api/types/reasoning-history';

export default function ReasoningHistoryDetailsPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const historyId = params.historyId as string;
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name ?? 'Workspace';

  const [viewMode, setViewMode] = useState<ViewMode>('details');

  const {data, error, isLoading} = useSWRResource<ReasoningHistoryResponse>(
    workspaceId && historyId ? swrKeys.reasoningHistoryDetails(workspaceId, historyId) : null,
    () => reasoningHistoryApi.get(workspaceId, historyId)
  );

  const tabs = useMemo(
    () => [
      {key: 'details', title: 'Overview', link: '#'},
      {key: 'trace', title: 'Reasoning Trace', link: '#'},
      {key: 'graph', title: 'Knowledge Graph', link: '#'}
    ],
    []
  );

  return (
    <div className="px-12 pt-4 pb-4">
      <BasePage
        title="Query Details"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.reasoningHistoryDetails(workspaceId, workspaceName, historyId)}
        tabs={tabs}
        activeTabKey={viewMode}
        onTabChange={(key) => setViewMode(key as ViewMode)}
      >
        <ConditionalSWRRenderer
          data={data}
          error={error}
          itemName="reasoning history"
          customIsLoading={isLoading}
          errorListStateProps={{title: 'Failed to load reasoning history'}}
          emptyListStateProps={{title: 'No reasoning history found'}}
        >
          {data && <ReasoningHistoryViewer data={data} viewMode={viewMode} />}
        </ConditionalSWRRenderer>
      </BasePage>
    </div>
  );
}
