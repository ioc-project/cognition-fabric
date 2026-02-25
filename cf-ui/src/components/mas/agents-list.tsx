'use client';

import {Plus, Users} from 'lucide-react';
import {FormLabel} from '@/components/ui/form';
import {Button} from '@/components/ui/button';
import {AgentCard} from './agent-card';
import type {Control, UseFormWatch} from 'react-hook-form';

interface Agent {
  name: string;
  url: string;
  remote_memory_provider_id: string;
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
  masAgentsData?: Record<string, any>;
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
    ? Object.entries(masAgentsData).map(([name, agentData]: [string, any]) => ({
        name,
        url: agentData.url || '',
        remote_memory_provider_id: agentData.remote_memory_provider_id || ''
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
              const agentName = watch(`agents.${index}.name`);
              const remoteMemoryProviderId = watch(`agents.${index}.remote_memory_provider_id`);

              return (
                <AgentCard
                  key={agent.id}
                  index={index}
                  agentId={agent.id}
                  agentName={agentName}
                  agentUrl={agent.url}
                  remoteMemoryProviderId={remoteMemoryProviderId}
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
                key={agent.name}
                index={index}
                agentId={agent.name}
                agentName={agent.name}
                agentUrl={agent.url}
                remoteMemoryProviderId={agent.remote_memory_provider_id}
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
