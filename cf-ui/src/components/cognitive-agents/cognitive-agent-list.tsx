'use client';

import {useState} from 'react';
import {Brain} from 'lucide-react';
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
        title="Cognitive Agents"
        description="Manage your cognitive agents"
        callToAction={
          cognitiveAgents.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                {viewMode === 'table' ? 'Card View' : 'Table View'}
              </Button>
              <Button onClick={() => router.push(routes.workspaces.cognitiveAgents.create(workspaceId))}>Create Agent</Button>
            </div>
          ) : undefined
        }
      >
        <ConditionalSWRRenderer
          data={cognitiveAgents}
          error={error}
          itemName="Cognitive Agents"
          customIsLoading={isLoading}
          customEmptyComponent={
            <div className="flex items-center justify-center min-h-[50vh]">
              <ListShell
                empty={{
                  icon: Brain,
                  title: 'No cognitive agents yet.',
                  description: 'Create your first cognitive agent to get started.',
                  actionLabel: 'Create Agent',
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
