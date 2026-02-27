'use client';

import {useState} from 'react';
import {Brain, Plus} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {routes} from '@/constants/routes';
import {useCognitiveAgents} from '@/hooks/useCognitiveAgents';
import {CognitiveAgentTableList} from '@/components/cognitive-agents/cognitive-agent-table-list';
import {CognitiveAgentCardList} from '@/components/cognitive-agents/cognitive-agent-card-list';

interface CognitiveAgentListProps {
  workspaceId: string;
}

export function CognitiveAgentList({workspaceId}: CognitiveAgentListProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {cognitiveAgents = [], isLoading, error} = useCognitiveAgents(workspaceId);

  return (
    <div className="space-y-8">
      <BasePage
        title="Cognition Agents"
        description="Manage your Cognition Agents"
        callToAction={
          cognitiveAgents.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                {viewMode === 'table' ? 'Card View' : 'Table View'}
              </Button>
              <Button asChild variant="sidebar" className="gap-2">
                <Link href={routes.workspaces.cognitiveAgents.create(workspaceId)}>
                  <Plus className="w-4 h-4" />
                  Create Cognition Agent
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      >
        <ConditionalSWRRenderer
          data={cognitiveAgents}
          error={error}
          itemName="Cognition Agents"
          customIsLoading={isLoading}
          customEmptyComponent={
            <div className="flex items-center justify-center min-h-[50vh]">
              <ListShell
                empty={{
                  icon: Brain,
                  title: 'No Cognition Agents yet.',
                  description: 'Create your first cognition agent to get started.',
                  actionLabel: 'Create Cognition Agent',
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
              onRowClick={(r) => {
                setSelectedId(r.cognitive_agent_id);
                router.push(routes.workspaces.cognitiveAgents.details(workspaceId, r.cognitive_agent_id));
              }}
            />
          ) : (
            <CognitiveAgentCardList
              cognitiveAgents={cognitiveAgents}
              workspaceId={workspaceId}
              selectedId={selectedId}
              onCardClick={(r) => {
                setSelectedId(r.cognitive_agent_id);
                router.push(routes.workspaces.cognitiveAgents.details(workspaceId, r.cognitive_agent_id));
              }}
            />
          )}
        </ConditionalSWRRenderer>
      </BasePage>
    </div>
  );
}
