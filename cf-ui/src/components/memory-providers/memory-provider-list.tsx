'use client';

import {useMemo, useState} from 'react';
import {HardDrive, Plus} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {SearchInput} from '@/components/ui/search-input';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {MemoryProviderTableList} from '@/components/memory-providers/memory-provider-table-list';
import {MemoryProviderCardList} from '@/components/memory-providers/memory-provider-card-list';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {useMemoryProviders} from '@/hooks/useMemoryProviders';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {routes} from '@/constants/routes';
import type {MemoryProvider} from '@/api/types/memory-provider';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

export function MemoryProviderList() {
  const router = useRouter();
  const {providers = [], isLoading: loading, error: swrError, deleteProvider} = useMemoryProviders();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  function toggleSort(key: string) {
    setSortConfig((prev) => (prev?.key === key ? (prev.dir === 'asc' ? {key, dir: 'desc'} : null) : {key, dir: 'asc'}));
  }

  const displayedProviders = useMemo(() => {
    let items: MemoryProvider[] = [...providers];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (sortConfig) {
      const {key, dir} = sortConfig;
      items.sort((a, b) => {
        let cmp = 0;
        if (key === 'name') {
          cmp = a.name.localeCompare(b.name);
        } else {
          const av = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bv = b.created_at ? new Date(b.created_at).getTime() : 0;
          cmp = av - bv;
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return items;
  }, [providers, searchQuery, sortConfig]);

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteProvider(data.id);
        toast.success(`Memory Provider "${data.name}" removed successfully`);
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
          title="Memory Providers"
          description="View and manage memory providers for your Multi Agentic Systems"
          callToAction={
            providers.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
                <Button asChild variant="sidebar" className="gap-2">
                  <Link href={routes.memoryProviders.create}>
                    <Plus className="w-4 h-4" />
                    Register Provider
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        >
          <ConditionalSWRRenderer
            data={providers}
            error={swrError}
            itemName="Memory Providers"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: HardDrive,
                    title: 'No Memory Providers registered.',
                    description: 'Register a memory provider to enable persistent memory for your agents.',
                    actionLabel: 'Register Memory Provider',
                    href: routes.memoryProviders.create
                  }}
                />
              </div>
            }
          >
            <div className="space-y-6">
              <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search…" className="max-w-xs" />
              {viewMode === 'table' ? (
                <MemoryProviderTableList
                  providers={displayedProviders}
                  selectedId={selectedId}
                  onRowClick={(provider: MemoryProvider) => {
                    setSelectedId(provider.id);
                    router.push(routes.memoryProviders.details(provider.id));
                  }}
                  onOpenDelete={(payload: {id: string; name: string}) => deleteDialog.open(payload)}
                  onOpenEdit={(provider: MemoryProvider) => router.push(`${routes.memoryProviders.details(provider.id)}?edit=true`)}
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
              ) : (
                <MemoryProviderCardList
                  providers={displayedProviders}
                  selectedId={selectedId}
                  onCardClick={(provider: MemoryProvider) => {
                    setSelectedId(provider.id);
                    router.push(routes.memoryProviders.details(provider.id));
                  }}
                  onOpenDelete={(payload: {id: string; name: string}) => deleteDialog.open(payload)}
                  onOpenEdit={(provider: MemoryProvider) => router.push(`${routes.memoryProviders.details(provider.id)}?edit=true`)}
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
        onConfirm={handleDelete}
        title={`Remove ${deleteDialog.data?.name || 'Memory Provider'}`}
        description={deleteError ?? `Are you sure you want to remove "${deleteDialog.data?.name}"? This action cannot be undone.`}
        confirmText="Remove"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
