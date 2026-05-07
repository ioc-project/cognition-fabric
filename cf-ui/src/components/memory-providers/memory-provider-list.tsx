'use client';

import {useState} from 'react';
import {Database, Plus} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
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

export function MemoryProviderList() {
  const router = useRouter();
  const {providers = [], isLoading: loading, error: swrError, deleteProvider} = useMemoryProviders();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
                    icon: Database,
                    title: 'No Memory Providers registered.',
                    description: 'Register a memory provider to enable persistent memory for your agents.',
                    actionLabel: 'Register Memory Provider',
                    href: routes.memoryProviders.create
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <MemoryProviderTableList
                providers={providers}
                selectedId={selectedId}
                onRowClick={(provider: MemoryProvider) => {
                  setSelectedId(provider.id);
                  router.push(routes.memoryProviders.details(provider.id));
                }}
                onOpenDelete={(payload: {id: string; name: string}) => deleteDialog.open(payload)}
                onOpenEdit={(provider: MemoryProvider) => router.push(`${routes.memoryProviders.details(provider.id)}?edit=true`)}
              />
            ) : (
              <MemoryProviderCardList
                providers={providers}
                selectedId={selectedId}
                onCardClick={(provider: MemoryProvider) => {
                  setSelectedId(provider.id);
                  router.push(routes.memoryProviders.details(provider.id));
                }}
                onOpenDelete={(payload: {id: string; name: string}) => deleteDialog.open(payload)}
                onOpenEdit={(provider: MemoryProvider) => router.push(`${routes.memoryProviders.details(provider.id)}?edit=true`)}
              />
            )}
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
