// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useMemo, useState} from 'react';
import {Plus, BrainCircuit} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {SearchInput} from '@/components/ui/search-input';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {routes} from '@/constants/routes';
import {MASTableList} from '@/components/mas/mas-table-list';
import {MASCardList} from '@/components/mas/mas-card-list';
import {useMAS} from '@/hooks/useMAS';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

interface MASListProps {
  workspaceId: string;
}

export function MASList({workspaceId}: MASListProps) {
  const router = useRouter();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const {masList = [], isLoading: loading, error: swrError, deleteMAS} = useMAS(workspaceId);

  function toggleSort(key: string) {
    setSortConfig((prev) => (prev?.key === key ? (prev.dir === 'asc' ? {key, dir: 'desc'} : null) : {key, dir: 'asc'}));
  }

  const displayedMas = useMemo(() => {
    let items: MultiAgenticSystem[] = [...masList];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((m) => m.name.toLowerCase().includes(q));
    }
    if (sortConfig) {
      const {key, dir} = sortConfig;
      items.sort((a, b) => {
        let cmp = 0;
        if (key === 'name') {
          cmp = a.name.localeCompare(b.name);
        } else {
          const av = a[key as 'created_at' | 'updated_at'] ? new Date(a[key as 'created_at' | 'updated_at'] as string).getTime() : 0;
          const bv = b[key as 'created_at' | 'updated_at'] ? new Date(b[key as 'created_at' | 'updated_at'] as string).getTime() : 0;
          cmp = av - bv;
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return items;
  }, [masList, searchQuery, sortConfig]);

  const handleDeleteMAS = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteMAS(data.id);
        toast.success(`Multi-Agent System "${data.name}" deleted successfully`);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  return (
    <>
      <div className="space-y-8">
        <BasePage
          title="Multi-Agentic Systems"
          description="View and manage all multi‑agentic systems"
          callToAction={
            masList.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
                <Button asChild variant="sidebar" className="gap-2" size="default">
                  <Link href={routes.mas.create}>
                    <Plus className="w-4 h-4" />
                    Create Multi-Agentic System
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        >
          <ConditionalSWRRenderer
            data={masList}
            error={swrError}
            itemName="Multi-Agentic Systems"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: BrainCircuit,
                    title: 'No Multi-Agentic Systems exist in this workspace.',
                    description: 'Create one to get started.',
                    actionLabel: 'Create Multi-Agent System',
                    href: routes.mas.create
                  }}
                />
              </div>
            }
          >
            <div className="space-y-3">
              <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search…" className="max-w-xs" />
              {viewMode === 'table' ? (
                <MASTableList
                  masList={displayedMas}
                  workspaceId={workspaceId}
                  selectedId={selectedId}
                  onRowClick={(mas) => {
                    setSelectedId(mas.id);
                    router.push(routes.mas.details(mas.id));
                  }}
                  onOpenDelete={(payload) => deleteDialog.open(payload)}
                  onOpenEdit={(mas) => router.push(`${routes.mas.details(mas.id)}?edit=true`)}
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
              ) : (
                <MASCardList
                  masList={displayedMas}
                  workspaceId={workspaceId}
                  selectedId={selectedId}
                  onCardClick={(mas) => {
                    setSelectedId(mas.id);
                    router.push(routes.mas.details(mas.id));
                  }}
                  onOpenDelete={(payload) => deleteDialog.open(payload)}
                  onOpenEdit={(mas) => router.push(`${routes.mas.details(mas.id)}?edit=true`)}
                />
              )}
            </div>
          </ConditionalSWRRenderer>
        </BasePage>
      </div>

      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteError(null);
            deleteDialog.close();
          }
        }}
        onConfirm={handleDeleteMAS}
        title={`Delete ${deleteDialog.data?.name || 'Multi-Agent System'}`}
        description={deleteError ?? `Delete "${deleteDialog.data?.name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
