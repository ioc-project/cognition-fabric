'use client';

import {useState} from 'react';
import {Brain} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {ListShell} from '@/components/ui/list-shell';
import {BasePage} from '@/components/ui/base-page';
import {routes} from '@/constants/routes';
import {useCognitionEngines} from '@/hooks/useCognitionEngines';
import {CognitiveAgentTableList} from '@/components/cognitive-agents/cognitive-agent-table-list';
import {CognitiveAgentCardList} from '@/components/cognitive-agents/cognitive-agent-card-list';

export function CognitiveAgentList() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {cognitionEngines = [], isLoading, error} = useCognitionEngines();

  return (
    <>
      <div className="space-y-8">
        <BasePage
          title="Cognition Engines"
          description="View your Cognition Engines"
          callToAction={
            cognitionEngines.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}>
                  {viewMode === 'table' ? 'Card View' : 'Table View'}
                </Button>
              </div>
            ) : undefined
          }
        >
          <ConditionalSWRRenderer
            data={cognitionEngines}
            error={error}
            itemName="Cognition Engines"
            customIsLoading={isLoading}
            customEmptyComponent={
              <div className="flex items-center justify-center min-h-[50vh]">
                <ListShell
                  empty={{
                    icon: Brain,
                    title: 'No Cognition Engines yet.',
                    description: 'Cognition engines will appear here once they are created.'
                  }}
                />
              </div>
            }
          >
            {viewMode === 'table' ? (
              <CognitiveAgentTableList
                cognitiveAgents={cognitionEngines}
                selectedId={selectedId}
                onRowClick={(r) => {
                  setSelectedId(r.cognitive_engine_id);
                  router.push(routes.cognitiveAgents.details(r.cognitive_engine_id));
                }}
              />
            ) : (
              <CognitiveAgentCardList
                cognitiveAgents={cognitionEngines}
                selectedId={selectedId}
                onCardClick={(r) => {
                  setSelectedId(r.cognitive_engine_id);
                  router.push(routes.cognitiveAgents.details(r.cognitive_engine_id));
                }}
              />
            )}
          </ConditionalSWRRenderer>
        </BasePage>
      </div>
    </>
  );
}
