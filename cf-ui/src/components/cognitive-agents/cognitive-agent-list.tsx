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
import {useCognitiveAgents, useMAS} from '@/hooks/useApi';
import {CognitiveAgentTableList} from '@/components/cognitive-agents/cognitive-agent-table-list';
import {CognitiveAgentCardList} from '@/components/cognitive-agents/cognitive-agent-card-list';

interface CognitiveAgentListProps {
  workspaceId: string;
}

export function CognitiveAgentList({workspaceId}: CognitiveAgentListProps) {
  const router = useRouter();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useConfirmDialog<{id: string; name: string}>();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {cognitiveAgents = [], isLoading: loading, error: swrError, deleteCognitiveAgent, mutate} = useCognitiveAgents(workspaceId);
  const {masList = []} = useMAS(workspaceId);
  const masById = useMemo(() => new Map(masList.map((m) => [m.id, m.name] as const)), [masList]);
  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteCognitiveAgent(data.id);
        toast.success(`Cognitive Agent "${data.name}" deleted successfully`);
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
          title="Cognitive Agents"
          description="View and manage all cognitive agents"
          callToAction={
            <div className="flex gap-2">
              {cognitiveAgents.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
              )}
              <Button asChild variant="sidebar" className="gap-2" size="default">
                <Link href={routes.workspaces.cognitiveAgents.create(workspaceId)}>
                  <Plus className="w-4 h-4" />
                  Create Cognitive Agent
                </Link>
              </Button>
            </div>
          }
        >
          <ConditionalSWRRenderer
            data={cognitiveAgents}
            error={swrError}
            itemName="Cognitive Agents"
            customIsLoading={loading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: Brain,
                    title: 'No Cognitive Agents exist in this workspace.',
                    description: 'Create a Cognitive Agent to orchestrate agents and run reasoning.',
                    actionLabel: 'Create Cognitive Agent',
                    href: routes.workspaces.cognitiveAgents.create(workspaceId)
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <CognitiveAgentTableList
                cognitiveAgents={cognitiveAgents}
                workspaceId={workspaceId}
                selectedId={selectedId}
                masById={masById}
                onRowClick={(r) => {
                  setSelectedId(r.id);
                  router.push(routes.workspaces.cognitiveAgents.details(workspaceId, r.id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            ) : (
              <CognitiveAgentCardList
                cognitiveAgents={cognitiveAgents}
                workspaceId={workspaceId}
                selectedId={selectedId}
                masById={masById}
                onCardClick={(r) => {
                  setSelectedId(r.id);
                  router.push(routes.workspaces.cognitiveAgents.details(workspaceId, r.id));
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
        title={`Delete ${deleteDialog.data?.name || 'Cognitive Agent'}`}
        description={deleteError ?? `Delete "${deleteDialog.data?.name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
