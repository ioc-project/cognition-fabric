'use client';

import {useState} from 'react';
import {Brain, Plus} from 'lucide-react';
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
import {useCognitiveAgents} from '@/hooks/useCognitiveAgents';
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

  const {cognitiveAgents = [], isLoading, error, deleteCognitiveAgent} = useCognitiveAgents(workspaceId);

  const handleDelete = async () => {
    await deleteDialog.confirm(async (data) => {
      try {
        await deleteCognitiveAgent(data.id);
        toast.success(`Cognition Engine "${data.name}" deleted successfully`);
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
          title="Cognition Engines"
          description="Manage your Cognition Engines"
          callToAction={
            cognitiveAgents.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
                <Button asChild variant="sidebar" className="gap-2">
                  <Link href={routes.cognitiveAgents.create}>
                    <Plus className="w-4 h-4" />
                    Create Cognition Engine
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        >
          <ConditionalSWRRenderer
            data={cognitiveAgents}
            error={error}
            itemName="Cognition Engines"
            customIsLoading={isLoading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: Brain,
                    title: 'No Cognition Engines yet.',
                    description: 'Create your first cognition engine to get started.',
                    actionLabel: 'Create Cognition Engine',
                    href: routes.cognitiveAgents.create
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
                onRowClick={(r) => {
                  setSelectedId(r.cognitive_agent_id);
                  router.push(routes.cognitiveAgents.details(r.cognitive_agent_id));
                }}
                onOpenDelete={(payload) => deleteDialog.open(payload)}
              />
            ) : (
              <CognitiveAgentCardList
                cognitiveAgents={cognitiveAgents}
                workspaceId={workspaceId}
                selectedId={selectedId}
                onCardClick={(r) => {
                  setSelectedId(r.cognitive_agent_id);
                  router.push(routes.cognitiveAgents.details(r.cognitive_agent_id));
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
        title={`Delete ${deleteDialog.data?.name || 'Cognition Engine'}`}
        description={deleteError ?? `Delete "${deleteDialog.data?.name}"? This action is permanent and cannot be undone.`}
        confirmText="Delete"
        loading={deleteDialog.isLoading}
        variant="destructive"
      />
    </>
  );
}
