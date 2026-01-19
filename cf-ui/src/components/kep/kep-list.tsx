'use client';

import {useState} from 'react';
import {Plus, Database} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {routes} from '@/constants/routes';
import type {KEP} from '@/api/types/kep';
import {KEPTableList} from '@/components/kep/kep-table-list';
import {KEPCardList} from '@/components/kep/kep-card-list';
import {useKEPs} from '@/hooks/useApi';

interface KEPListProps {
  workspaceId: string;
}

export function KEPList({workspaceId}: KEPListProps) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {knowledgeAdapters = [], isLoading: loading, isValidating, error: swrError, deleteKnowledgeAdapters} = useKEPs(workspaceId);

  const knowledgeAdaptersList: KEP[] = knowledgeAdapters;

  const handleDeleteKnowledgeAdapter = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteKnowledgeAdapters(data.id);
        toast.success(`Knowledge Adapter "${data.name}" deleted successfully`);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  const createKepPath = routes.workspaces.knowledge.create(workspaceId);

  return (
    <>
      <div className="space-y-8 px-8 pt-4 relative z-0">
        <BasePage
          title="Knowledge Adapters"
          description="View and manage all knowledge adapters"
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
          <ConditionalSWRRenderer
            data={knowledgeAdaptersList}
            error={swrError}
            itemName="Knowledge Adapters"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: Database,
                    title: 'No Knowledge Adapters exist in this workspace.',
                    description: 'Create a Knowledge Adapter to connect systems and ingest data.',
                    actionLabel: 'Create Knowledge Adapter',
                    href: createKepPath
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <KEPTableList
                keps={knowledgeAdaptersList}
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
                keps={knowledgeAdaptersList}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onCardClick={(kep) => {
                  setSelectedId(kep.id);
                  router.push(routes.workspaces.knowledge.details(workspaceId, kep.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
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
        onConfirm={handleDeleteKnowledgeAdapter}
        title={`Delete ${deleteDialog.data?.name || 'Knowledge Adapter'}`}
        description={deleteError ?? `Delete "${deleteDialog.data?.name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
