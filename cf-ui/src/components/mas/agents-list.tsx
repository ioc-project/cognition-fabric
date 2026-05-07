'use client';

import {Plus, Users} from 'lucide-react';
import {FormLabel} from '@/components/ui/form';
import {Button} from '@/components/ui/button';
import {AgentCard} from './agent-card';
import type {Control, UseFormWatch} from 'react-hook-form';
import type {AgentWithMemory} from '@/api/endpoints/mas';

interface Agent {
  agent_id: string;
  agentic_memory_provider_id?: string;
}

interface AgentsListProps {
  agents: Array<{id: string} & Agent>;
  control: Control<any>;
  watch: UseFormWatch<any>;
  isEditMode: boolean;
  agentExpandedState: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onAddAgent?: () => void;
  onRemoveAgent?: (index: number) => void;
  masAgentsData?: AgentWithMemory[];
  userMemoryProviders?: Array<{id: string; provider_name: string}>;
}

export function AgentsList({
  agents,
  control,
  watch,
  isEditMode,
  agentExpandedState,
  onToggleExpand,
  onAddAgent,
  onRemoveAgent,
  masAgentsData,
  userMemoryProviders = []
}: AgentsListProps) {
  const viewModeAgents = masAgentsData
    ? masAgentsData.map((agent) => ({
        agent_id: agent.agent_id,
        agentic_memory_provider_id: agent.agentic_memory?.id || '',
        agentic_memory_provider_name: agent.agentic_memory?.name || ''
      }))
    : [];

  const displayAgents = isEditMode ? agents : viewModeAgents;
  const hasAgents = displayAgents.length > 0;

  return (
    <div className="space-y-4 border-t pt-6">
      <FormLabel>Agents</FormLabel>
      {isEditMode ? (
        <>
          {!hasAgents ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">No agents added yet</p>
              {onAddAgent && (
                <Button type="button" variant="sidebar" size="sm" className="gap-2" onClick={onAddAgent}>
                  <Plus className="w-4 h-4" />
                  Add Your First Agent
                </Button>
              )}
            </div>
          ) : (
            agents.map((agent, index) => {
              const isExpanded = agentExpandedState[agent.id] ?? true;
              const agentId = watch(`agents.${index}.agent_id`);
              const agenticMemoryProviderId = watch(`agents.${index}.agentic_memory_provider_id`);

              return (
                <AgentCard
                  key={agent.id}
                  index={index}
                  agentId={agent.id}
                  agentIdValue={agentId}
                  agenticMemoryProviderId={agenticMemoryProviderId}
                  isExpanded={isExpanded}
                  isEditMode={isEditMode}
                  control={control}
                  onToggleExpand={() => onToggleExpand(agent.id)}
                  onRemove={onRemoveAgent ? () => onRemoveAgent(index) : undefined}
                  userMemoryProviders={userMemoryProviders}
                />
              );
            })
          )}

          {hasAgents && onAddAgent && (
            <div className="flex justify-end">
              <Button type="button" variant="sidebar" size="sm" className="gap-2" onClick={onAddAgent}>
                <Plus className="w-4 h-4" />
                Add Agent
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {hasAgents ? (
            viewModeAgents.map((agent, index) => (
              <AgentCard
                key={agent.agent_id}
                index={index}
                agentId={agent.agent_id}
                agentIdValue={agent.agent_id}
                agenticMemoryProviderId={agent.agentic_memory_provider_id}
                agenticMemoryProviderName={agent.agentic_memory_provider_name}
                isExpanded={true}
                isEditMode={false}
                control={control}
                onToggleExpand={() => {}}
                userMemoryProviders={userMemoryProviders}
              />
            ))
          ) : (
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No agents configured</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
