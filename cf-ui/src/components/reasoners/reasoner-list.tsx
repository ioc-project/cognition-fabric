'use client';

import {useState} from 'react';
import {Plus, AlertCircle, Brain} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {parseError} from '@/lib/utils';
import {toast} from 'sonner';
import {useConfirmDialog} from '@/hooks/useConfirmDialog';
import {routes} from '@/constants/routes';
import {useReasoners, useMAS} from '@/hooks/useApi';
import {ReasonerTableList} from '@/components/reasoners/reasoner-table-list';
import {ReasonerCardList} from '@/components/reasoners/reasoner-card-list';

interface ReasonerListProps {
  workspaceId: string;
}

export function ReasonerList({workspaceId}: ReasonerListProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {reasoners = [], isLoading: loading, isValidating, error: swrError, deleteReasoner} = useReasoners(workspaceId);
  const {masList = []} = useMAS(workspaceId);
  const masById = new Map(masList.map((m) => [m.id, m.name] as const));
  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteReasoner(data.id);
        toast.success(`Reasoner "${data.name}" deleted successfully`);
      } catch (err) {
        const errorMessage = parseError(err);
        setDeleteError(errorMessage);
        throw err;
      }
    });
  };

  return (
    <>
      <ConditionalSWRRenderer
        data={reasoners}
        error={swrError}
        itemName="Reasoners"
        customIsLoading={loading || isValidating}
        customEmptyComponent={
          <div className="flex items-center justify-center min-h-[calc(100vh-116px)] px-8">
            <ListShell
              empty={{
                icon: Brain,
                title: 'No Reasoners exist in this workspace.',
                description: 'Create a Reasoner to orchestrate agents and run reasoning.',
                actionLabel: 'Create Reasoner',
                href: routes.workspaces.reasoners.create(workspaceId)
              }}
            />
          </div>
        }
      >
        <div className="space-y-8 px-8 pt-4 relative z-0">
          <BasePage
            title="Reasoners"
            callToAction={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
                <Button asChild variant="sidebar" className="gap-2" size="default">
                  <Link href={routes.workspaces.reasoners.create(workspaceId)}>
                    <Plus className="w-4 h-4" />
                    Create Reasoner
                  </Link>
                </Button>
              </div>
            }
          >
            {error && !deleteDialog.isOpen && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {viewMode === 'table' ? (
              <ReasonerTableList
                reasoners={reasoners}
                workspaceId={workspaceId}
                selectedId={selectedId}
                masById={masById}
                onRowClick={(r) => {
                  setSelectedId(r.id);
                  router.push(routes.workspaces.reasoners.details(workspaceId, r.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            ) : (
              <ReasonerCardList
                reasoners={reasoners}
                workspaceId={workspaceId}
                selectedId={selectedId}
                masById={masById}
                onCardClick={(r) => {
                  setSelectedId(r.id);
                  router.push(routes.workspaces.reasoners.details(workspaceId, r.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            )}
          </BasePage>
        </div>
      </ConditionalSWRRenderer>

      <ConfirmDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteError(null);
            deleteDialog.close();
          }
        }}
        onConfirm={handleDelete}
        title={`Delete ${deleteDialog.data?.name || 'Reasoner'}`}
        description={deleteError ?? `Delete "${deleteDialog.data?.name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
