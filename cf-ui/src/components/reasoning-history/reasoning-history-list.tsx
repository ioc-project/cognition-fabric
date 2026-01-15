'use client';

import {useRouter} from 'next/navigation';
import {History} from 'lucide-react';
import useSWR from 'swr';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs, routes} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {ListShell} from '@/components/ui/list-shell';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {reasoningHistoryApi} from '@/api/endpoints/reasoning-history';
import {reasonerApi} from '@/api/endpoints/reasoners';
import {masApi} from '@/api/endpoints/mas';
import {ReasoningHistoryTableList} from './reasoning-history-table-list';
import type {QueryHistoryListItem} from '@/api/types/reasoning-history';
import type {Reasoner} from '@/api/types/reasoner';
import type {MAS} from '@/api/types/mas';

interface ReasoningHistoryListProps {
  workspaceId: string;
}

export function ReasoningHistoryList({workspaceId}: ReasoningHistoryListProps) {
  const router = useRouter();
  const {workspace} = useCurrentWorkspace();
  const workspaceName = workspace?.name ?? 'Workspace';

  const {
    data: items = [],
    error,
    isLoading
  } = useSWR<QueryHistoryListItem[]>(workspaceId ? ['reasoning-history-list', workspaceId] : null, () => reasoningHistoryApi.list(workspaceId));

  const {data: reasoners = []} = useSWR<Reasoner[]>(workspaceId ? ['reasoners-list', workspaceId] : null, () => reasonerApi.list(workspaceId));

  const {data: masList = []} = useSWR<MAS[]>(workspaceId ? ['mas-list', workspaceId] : null, () => masApi.list(workspaceId));

  const reasonerById = new Map(reasoners.map((r) => [r.id, r]));
  const masById = new Map(masList.map((m) => [m.id, m]));

  const handleRowClick = (item: QueryHistoryListItem) => {
    router.push(routes.workspaces.reasoningHistory.details(workspaceId, item.id));
  };

  return (
    <div className="space-y-8 px-8 pt-4">
      <BasePage
        title="Reasoning History"
        description="View all reasoning queries run in this workspace"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.workspaceReasoningHistory(workspaceId, workspaceName)}
      >
        <ConditionalSWRRenderer
          data={items}
          error={error}
          itemName="Reasoning History"
          customIsLoading={isLoading}
          customEmptyComponent={
            <ListShell
              empty={{
                icon: History,
                title: 'No reasoning history in this workspace.',
                description: 'Run queries on your reasoners to see history here.'
              }}
            />
          }
        >
          <ReasoningHistoryTableList items={items} reasonerById={reasonerById} masById={masById} onRowClick={handleRowClick} />
        </ConditionalSWRRenderer>
      </BasePage>
    </div>
  );
}
