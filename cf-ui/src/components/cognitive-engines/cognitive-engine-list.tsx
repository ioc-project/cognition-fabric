'use client';

import {useState, useMemo} from 'react';
import {Plus, Brain} from 'lucide-react';
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
import {useCognitiveEngines} from '@/hooks/useCognitiveEngines';
import {useMAS} from '@/hooks/useMAS';
import {CognitiveEngineTableList} from '@/components/cognitive-engines/cognitive-engine-table-list';
import {CognitiveEngineCardList} from '@/components/cognitive-engines/cognitive-engine-card-list';

interface CognitiveEngineListProps {
  workspaceId: string;
}

export function CognitiveEngineList({workspaceId}: CognitiveEngineListProps) {
  const router = useRouter();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    cognitiveEngines: cognitiveAgents = [],
    isLoading: loading,
    error: swrError,
    deleteCognitiveEngine: deleteCognitiveAgent
  } = useCognitiveEngines(workspaceId);
  const {masList = []} = useMAS(workspaceId);
  const masById = useMemo(() => new Map(masList.map((m) => [m.id, m.name] as const)), [masList]);
  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteCognitiveAgent(data.id);
        toast.success(`Cognitive Engine "${data.name}" deleted successfully`);
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
          title="Cognitive Engines"
          description="View and manage all cognitive engines"
          callToAction={
            <div className="flex gap-2">
              {cognitiveAgents.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
              )}
              <Button asChild variant="sidebar" className="gap-2" size="default">
                <Link href={routes.workspaces.cognitiveEngines.create(workspaceId)}>
                  <Plus className="w-4 h-4" />
                  Create Cognitive Engine
                </Link>
              </Button>
            </div>
          }
        >
          <ConditionalSWRRenderer
            data={cognitiveAgents}
            error={swrError}
            itemName="Cognitive Engines"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: Brain,
                    title: 'No Cognitive Engines exist in this workspace.',
                    description: 'Create a Cognitive Engine to orchestrate agents and run reasoning.',
                    actionLabel: 'Create Cognitive Engine',
                    href: routes.workspaces.cognitiveEngines.create(workspaceId)
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <CognitiveEngineTableList
                cognitiveAgents={cognitiveAgents}
                workspaceId={workspaceId}
                selectedId={selectedId}
                masById={masById}
                onRowClick={(r) => {
                  setSelectedId(r.id);
                  router.push(routes.workspaces.cognitiveEngines.details(workspaceId, r.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            ) : (
              <CognitiveEngineCardList
                cognitiveAgents={cognitiveAgents}
                workspaceId={workspaceId}
                selectedId={selectedId}
                masById={masById}
                onCardClick={(r) => {
                  setSelectedId(r.id);
                  router.push(routes.workspaces.cognitiveEngines.details(workspaceId, r.id));
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
        onConfirm={handleDelete}
        title={`Delete ${deleteDialog.data?.name || 'Cognitive Engine'}`}
        description={deleteError ?? `Delete "${deleteDialog.data?.name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
