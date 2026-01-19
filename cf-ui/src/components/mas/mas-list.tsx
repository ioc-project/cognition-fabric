'use client';

import {useState} from 'react';
import {Plus, Boxes} from 'lucide-react';
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
import {MASTableList} from '@/components/mas/mas-table-list';
import {MASCardList} from '@/components/mas/mas-card-list';
import {useMAS} from '@/hooks/useApi';

interface MASListProps {
  workspaceId: string;
}

export function MASList({workspaceId}: MASListProps) {
  const router = useRouter();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {masList = [], isLoading: loading, isValidating, error: swrError, deleteMAS} = useMAS(workspaceId);

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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                {viewMode === 'table' ? 'Card View' : 'Table View'}
              </Button>
              <Button asChild variant="sidebar" className="gap-2" size="default">
                <Link href={routes.workspaces.mas.create(workspaceId)}>
                  <Plus className="w-4 h-4" />
                  Create MAS
                </Link>
              </Button>
            </div>
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
                    icon: Boxes,
                    title: 'No Multi-Agentic Systems exist in this workspace.',
                    description: 'Create one to get started.',
                    actionLabel: 'Create Multi-Agent System',
                    href: routes.workspaces.mas.create(workspaceId)
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <MASTableList
                masList={masList}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onRowClick={(mas) => {
                  setSelectedId(mas.id);
                  router.push(routes.workspaces.mas.details(workspaceId, mas.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            ) : (
              <MASCardList
                masList={masList}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onCardClick={(mas) => {
                  setSelectedId(mas.id);
                  router.push(routes.workspaces.mas.details(workspaceId, mas.id));
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
