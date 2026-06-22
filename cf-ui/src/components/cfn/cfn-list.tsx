'use client';

import {CircuitBoard, Plus} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useMemo, useState} from 'react';
import {Button} from '@/components/ui/button';
import {SearchInput} from '@/components/ui/search-input';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {CfnTableList} from './cfn-table-list';
import {CfnCardList} from './cfn-card-list';
import {useCfn} from '@/hooks/useCfn';
import {routes} from '@/constants/routes';
import type {Cfn} from '@/api/types/cfn';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

export function CfnList() {
  const router = useRouter();
  const {cfns = [], isLoading: loading, error: swrError} = useCfn();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  function toggleSort(key: string) {
    setSortConfig((prev) => (prev?.key === key ? (prev.dir === 'asc' ? {key, dir: 'desc'} : null) : {key, dir: 'asc'}));
  }

  const displayedCfns = useMemo(() => {
    let items: Cfn[] = [...cfns];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (sortConfig) {
      const {key, dir} = sortConfig;
      items.sort((a, b) => {
        let cmp = 0;
        if (key === 'name' || key === 'status') {
          cmp = ((a[key as keyof Cfn] as string) ?? '').localeCompare((b[key as keyof Cfn] as string) ?? '');
        } else {
          const av = a[key as 'last_seen' | 'created_at'] ? new Date(a[key as 'last_seen' | 'created_at'] as string).getTime() : 0;
          const bv = b[key as 'last_seen' | 'created_at'] ? new Date(b[key as 'last_seen' | 'created_at'] as string).getTime() : 0;
          cmp = av - bv;
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return items;
  }, [cfns, searchQuery, sortConfig]);

  return (
    <>
      <div className="space-y-8">
        <BasePage
          title="Cognition Fabric Nodes"
          description="View and manage Cognition Fabric Nodes"
          callToAction={
            cfns.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
                <Button asChild variant="sidebar" className="gap-2">
                  <Link href={routes.cfn.create}>
                    <Plus className="w-4 h-4" />
                    Register Cognition Fabric Node
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        >
          <ConditionalSWRRenderer
            data={cfns}
            error={swrError}
            itemName="Cognition Fabric Nodes"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: CircuitBoard,
                    title: 'No Cognition Fabric Nodes exist.',
                    description: 'Register a Cognition Fabric Node to start managing your distributed memory plane.',
                    actionLabel: 'Register Node',
                    href: routes.cfn.create
                  }}
                />
              </div>
            }
          >
            <div className="space-y-6">
              <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search…" className="max-w-xs" />
              {viewMode === 'table' ? (
                <CfnTableList
                  cfns={displayedCfns}
                  selectedId={selectedId}
                  onRowClick={(cfn) => {
                    setSelectedId(cfn.id);
                    router.push(routes.cfn.details(cfn.id));
                  }}
                  onOpenEdit={(cfn) => router.push(`${routes.cfn.details(cfn.id)}?edit=true`)}
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
              ) : (
                <CfnCardList
                  cfns={displayedCfns}
                  selectedId={selectedId}
                  onCardClick={(cfn) => {
                    setSelectedId(cfn.id);
                    router.push(routes.cfn.details(cfn.id));
                  }}
                  onOpenEdit={(cfn) => router.push(`${routes.cfn.details(cfn.id)}?edit=true`)}
                />
              )}
            </div>
          </ConditionalSWRRenderer>
        </BasePage>
      </div>
    </>
  );
}
