'use client';

import {Bot, Users} from 'lucide-react';
import {AgentCard} from './agent-card';
import type {Control, UseFormWatch} from 'react-hook-form';
import type {AgentWithMemory} from '@/api/endpoints/mas';

interface Agent {
  agent_id?: string;
  name?: string;
  url?: string;
  agentic_memory_provider_id?: string;
  identity_type?: string;
  identity_identifiers?: string | Record<string, string>;
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
        name: agent.name || '',
        url: agent.url || '',
        agentic_memory_provider_id: agent.agentic_memory?.id || '',
        agentic_memory_provider_name: agent.agentic_memory?.name || '',
        identity_type: agent.identity?.type || '',
        identity_identifiers: agent.identity?.identifiers || {}
      }))
    : [];

  const displayAgents = isEditMode ? agents : viewModeAgents;
  const agentCount = displayAgents.length;

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-[hsl(var(--sidebar-icon-active))]" />
          <span className="text-sm font-medium text-slate-700">Agents</span>
          {agentCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--sidebar-icon-active)/0.08)] text-[hsl(var(--sidebar-icon-active))] border border-[hsl(var(--sidebar-icon-active)/0.25)] text-[10px] font-mono">
              {agentCount}
            </span>
          )}
        </div>
        {isEditMode && onAddAgent && (
          <button type="button" onClick={onAddAgent} className="text-[11px] text-blue-600 hover:text-blue-700 transition-colors">
            + Add Agent
          </button>
        )}
      </div>

      {/* Content */}
      {agentCount === 0 ? (
        <div className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-3">
            <Users className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{isEditMode ? 'No agents added yet' : 'No agents configured'}</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {isEditMode
            ? agents.map((agent, index) => {
                const isExpanded = agentExpandedState[agent.id] ?? true;
                const agentName = watch(`agents.${index}.name`);
                const agenticMemoryProviderId = watch(`agents.${index}.agentic_memory_provider_id`);
                return (
                  <AgentCard
                    key={agent.id}
                    index={index}
                    agentId={agent.id}
                    agentName={agentName}
                    agentIdValue={agent.agent_id}
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
            : viewModeAgents.map((agent, index) => (
                <AgentCard
                  key={agent.agent_id}
                  index={index}
                  agentId={agent.agent_id}
                  agentName={agent.name}
                  agentIdValue={agent.agent_id}
                  agentUrl={agent.url}
                  identityType={agent.identity_type}
                  identityIdentifiers={agent.identity_identifiers}
                  agenticMemoryProviderId={agent.agentic_memory_provider_id}
                  agenticMemoryProviderName={agent.agentic_memory_provider_name}
                  isExpanded={agentExpandedState[agent.agent_id] ?? true}
                  isEditMode={false}
                  control={control}
                  onToggleExpand={() => onToggleExpand(agent.agent_id)}
                  userMemoryProviders={userMemoryProviders}
                />
              ))}
        </div>
      )}
    </div>
  );
}
