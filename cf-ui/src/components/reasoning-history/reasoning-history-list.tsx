'use client';

import {useRouter} from 'next/navigation';
import {History} from 'lucide-react';
import {BasePage} from '@/components/ui/base-page';
import {breadcrumbs, routes} from '@/constants/routes';
import {useCurrentWorkspace} from '@/hooks/useCurrentWorkspace';
import {useSWRResource} from '@/hooks/useSWRResource';
import {ListShell} from '@/components/ui/list-shell';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {reasoningHistoryApi} from '@/api/endpoints/reasoning-history';
import {reasonerApi} from '@/api/endpoints/reasoners';
import {masApi} from '@/api/endpoints/mas';
import {ReasoningHistoryTableList} from './reasoning-history-table-list';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Select, SelectTrigger, SelectContent, SelectItem, SelectValue} from '@/components/ui/select';
import {DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {CalendarIcon, SlidersHorizontal, Filter} from 'lucide-react';
import {DateRangePicker} from '@/components/ui/date-range-picker';
import {Pagination} from '@/components/ui/pagination';
import type {ReasoningHistoryEventsFilter} from '@/api/types/reasoning-history';
import {useState, useMemo} from 'react';
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

  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(0);
  const [pendingFilters, setPendingFilters] = useState<{
    reasonerId?: string;
    createdBy?: string;
    start?: string;
    end?: string;
    requestId?: string;
    responseId?: string;
    limit?: number;
  }>({limit: PAGE_SIZE});
  const [appliedFilters, setAppliedFilters] = useState<ReasoningHistoryEventsFilter>({limit: PAGE_SIZE, offset: 0});

  const resolvedFilters: ReasoningHistoryEventsFilter = useMemo(() => {
    return {
      reasoner_id: pendingFilters.reasonerId || undefined,
      created_by: pendingFilters.createdBy || undefined,
      request_id: pendingFilters.requestId?.trim() ? pendingFilters.requestId : undefined,
      response_id: pendingFilters.responseId?.trim() ? pendingFilters.responseId : undefined,
      start_date: pendingFilters.start ? new Date(pendingFilters.start).toISOString() : undefined,
      end_date: pendingFilters.end ? new Date(pendingFilters.end).toISOString() : undefined,
      limit: PAGE_SIZE,
      offset: currentPage * PAGE_SIZE
    };
  }, [pendingFilters, currentPage]);

  const {
    data: responseData,
    error,
    isLoading
  } = useSWRResource<{records: QueryHistoryListItem[]; total: number}>(
    workspaceId ? ['reasoning-history-list', workspaceId, JSON.stringify(appliedFilters)] : null,
    () => reasoningHistoryApi.list(workspaceId, appliedFilters)
  );

  const {data: reasonersData} = useSWRResource<Reasoner[]>(workspaceId ? ['reasoners-list', workspaceId] : null, () => reasonerApi.list(workspaceId));

  const {data: masData} = useSWRResource<MAS[]>(workspaceId ? ['mas-list', workspaceId] : null, () => masApi.list(workspaceId));

  const totalItems = responseData?.total ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const reasoners = reasonersData ?? [];
  const masList = masData ?? [];

  // Client-side filtering for search text (instant feedback as you type)
  const filteredItems = useMemo(() => {
    const items = responseData?.records ?? [];
    const searchText = pendingFilters.createdBy?.toLowerCase().trim();
    if (!searchText) {
      return items;
    }
    return items.filter((item) => item.query_input?.toLowerCase().includes(searchText) || item.created_by?.toLowerCase().includes(searchText));
  }, [responseData?.records, pendingFilters.createdBy]);

  const reasonerById = new Map(reasoners.map((r) => [r.id, r]));
  const masById = new Map(masList.map((m) => [m.id, m]));

  const handleRowClick = (item: QueryHistoryListItem) => {
    router.push(routes.workspaces.reasoningHistory.details(workspaceId, item.id));
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col px-8 pt-4">
      <BasePage
        title="Reasoning History"
        description="View all reasoning queries run in this workspace"
        useBreadcrumbs
        breadcrumbs={breadcrumbs.workspaceReasoningHistory(workspaceId, workspaceName)}
      >
        <div className="pb-3 bg-[hsl(var(--main-background))]">
          <div className="w-full pt-3 space-y-2">
            <div className="px-0">
              <Input
                placeholder="Search by query input or creator"
                value={pendingFilters.createdBy ?? ''}
                onChange={(e) => setPendingFilters((p) => ({...p, createdBy: e.target.value}))}
                className="!h-12 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 px-4 text-xs w-44">
                    <span className="inline-flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" /> Creation
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="start" sideOffset={6} className="w-[360px] max-w-[calc(100vw-260px)] p-0 overflow-hidden">
                  <div className="px-2 py-2 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-xs">From</Label>
                        <Input
                          readOnly
                          value={pendingFilters.start ? new Date(pendingFilters.start).toLocaleDateString('en-US') : ''}
                          placeholder="MM/DD/YYYY"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">To</Label>
                        <Input
                          readOnly
                          value={pendingFilters.end ? new Date(pendingFilters.end).toLocaleDateString('en-US') : ''}
                          placeholder="MM/DD/YYYY"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <DateRangePicker
                      value={{
                        from: pendingFilters.start ? new Date(pendingFilters.start) : undefined,
                        to: pendingFilters.end ? new Date(pendingFilters.end) : undefined
                      }}
                      onChange={(range) => {
                        setPendingFilters((p) => ({
                          ...p,
                          start: range?.from ? new Date(range.from).toISOString() : undefined,
                          end: range?.to ? new Date(range.to).toISOString() : undefined
                        }));
                      }}
                    />
                  </div>
                  <DropdownMenuSeparator />
                  <div className="flex justify-end gap-2 px-2 pb-2">
                    <Button variant="outline" size="sm" onClick={() => setPendingFilters((p) => ({...p, start: undefined, end: undefined}))}>
                      Clear
                    </Button>
                    <Button variant="sidebar" size="sm" onClick={() => setAppliedFilters(resolvedFilters)}>
                      Apply
                    </Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <Select
                value={pendingFilters.reasonerId ?? '__all__'}
                onValueChange={(val) => {
                  const newReasonerId = val === '__all__' ? undefined : val;
                  setPendingFilters((p) => ({...p, reasonerId: newReasonerId}));
                  setAppliedFilters((prev) => ({...prev, reasoner_id: newReasonerId, offset: 0}));
                }}
              >
                <SelectTrigger className="h-8 text-xs soft-card w-44">
                  <SelectValue placeholder="All reasoners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All reasoners</SelectItem>
                  {reasoners.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 px-4 text-xs w-44">
                    <SlidersHorizontal className="h-4 w-4" /> Advanced
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80">
                  <div className="px-2 py-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Request ID</Label>
                      <Input
                        value={pendingFilters.requestId ?? ''}
                        onChange={(e) => setPendingFilters((p) => ({...p, requestId: e.target.value}))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Response ID</Label>
                      <Input
                        value={pendingFilters.responseId ?? ''}
                        onChange={(e) => setPendingFilters((p) => ({...p, responseId: e.target.value}))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="flex justify-end gap-2 px-2 pb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingFilters((p) => ({...p, requestId: undefined, responseId: undefined}))}
                    >
                      Clear
                    </Button>
                    <Button variant="sidebar" size="sm" onClick={() => setAppliedFilters(resolvedFilters)}>
                      Apply
                    </Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Apply */}
              <Button variant="sidebar" size="sm" className="h-9 px-4 text-xs w-44" onClick={() => setAppliedFilters(resolvedFilters)}>
                <Filter className="h-4 w-4 mr-1" /> Apply
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 text-xs w-44"
                onClick={() => {
                  setPendingFilters({limit: PAGE_SIZE});
                  setAppliedFilters({limit: PAGE_SIZE, offset: 0});
                  setCurrentPage(0);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <ConditionalSWRRenderer
            data={filteredItems}
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
            <ReasoningHistoryTableList items={filteredItems} reasonerById={reasonerById} masById={masById} onRowClick={handleRowClick} />
          </ConditionalSWRRenderer>
        </div>
        {/* Pagination */}
        {totalPages > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {filteredItems.length > 0 ? currentPage * PAGE_SIZE + 1 : 0} - {Math.min((currentPage + 1) * PAGE_SIZE, totalItems)} of{' '}
              {totalItems} items
            </div>
            <Pagination
              currentPage={currentPage + 1}
              totalPages={totalPages}
              onPageChange={(page) => {
                const newPage = page - 1;
                setCurrentPage(newPage);
                setAppliedFilters((prev) => ({...prev, offset: newPage * PAGE_SIZE}));
              }}
            />
          </div>
        )}
      </BasePage>
    </div>
  );
}
