'use client';

import {useState} from 'react';
import {Plus, AlertCircle, Database} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {kepApi} from '@/api/endpoints';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {routes} from '@/constants/routes';
import useSWR from 'swr';
import type {KEP} from '@/api/types/kep';
import {KEPTableList} from '@/components/kep/kep-table-list';
import {KEPCardList} from '@/components/kep/kep-card-list';

interface KEPListProps {
  workspaceId: string;
}

export function KEPList({workspaceId}: KEPListProps) {
  const [error, setError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: kepList = [],
    isLoading: loading,
    mutate: mutateKep,
    error: swrError
  } = useSWR<KEP[]>(['kep-list', workspaceId], () => kepApi.list(workspaceId));

  const safeKepList: KEP[] = kepList;

  const handleDeleteKEP = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await kepApi.delete(workspaceId, data.id);
        await mutateKep();
        toast.success(`Knowledge Adapter "${data.name}" deleted successfully`);
      } catch (err) {
        const errorMessage = parseError(err);
        setError(errorMessage);
        toast.error(`Failed to delete Knowledge Adapter: ${errorMessage}`);
      }
    });
  };

  // loading/empty states handled by ConditionalSWRRenderer below

  const createKepPath = (routes.workspaces.knowledge as any).create
    ? (routes.workspaces.knowledge as any).create(workspaceId)
    : `${routes.workspaces.knowledge.list(workspaceId)}/create`;

  return (
    <>
      <ConditionalSWRRenderer
        data={kepList}
        error={swrError}
        itemName="Knowledge Adapters"
        customIsLoading={loading}
        customEmptyComponent={
          <div className="flex items-center justify-center min-h-[calc(100vh-116px)] px-8">
            <ListShell
              empty={{
                icon: Database,
                title: 'No Knowledge Adapters',
                description: 'Create a Knowledge Adapter to connect systems and ingest data.',
                actionLabel: 'Create Knowledge Adapter',
                href: createKepPath
              }}
            />
          </div>
        }
      >
        <div className="space-y-8 px-8 pt-4 relative z-0">
          <BasePage
            title="Knowledge Adapters"
            callToAction={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
                <Button asChild variant="sidebar" className="gap-2" size="default">
                  <Link href={createKepPath}>
                    <Plus className="w-4 h-4" />
                    Create Knowledge Adapter
                  </Link>
                </Button>
              </div>
            }
          >
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {viewMode === 'table' ? (
              <KEPTableList
                keps={safeKepList}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onRowClick={(kep) => {
                  setSelectedId(kep.id);
                  router.push(routes.workspaces.knowledge.details(workspaceId, kep.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            ) : (
              <KEPCardList
                keps={safeKepList}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onCardClick={(kep) => {
                  setSelectedId(kep.id);
                  router.push(routes.workspaces.knowledge.details(workspaceId, kep.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            )}
          </BasePage>
        </div>
      </ConditionalSWRRenderer>

      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && deleteDialog.close()}
        onConfirm={handleDeleteKEP}
        title={`Delete ${deleteDialog.data?.name || 'Knowledge Adapter'}`}
        description={`Delete "${deleteDialog.data?.name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
