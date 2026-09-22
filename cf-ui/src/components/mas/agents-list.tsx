// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Plus, Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {AgentCard} from './agent-card';
import type {Control, UseFormWatch} from 'react-hook-form';
import type {AgentDetail} from '@/api/endpoints/mas';

interface Agent {
  agent_id?: string;
  name?: string;
  url?: string;
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
  masAgentsData?: AgentDetail[];
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
  masAgentsData
}: AgentsListProps) {
  const viewModeAgents = masAgentsData
    ? masAgentsData.map((agent) => ({
        agent_id: agent.agent_id,
        name: agent.name || '',
        url: agent.url || '',
        identity_type: agent.identity?.type || '',
        identity_identifiers: agent.identity?.identifiers || {}
      }))
    : [];

  const displayAgents = isEditMode ? agents : viewModeAgents;
  const hasAgents = displayAgents.length > 0;

  return (
    <div className="space-y-4">
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

              return (
                <AgentCard
                  key={agent.id}
                  index={index}
                  agentId={agent.id}
                  agentName={agentName}
                  isExpanded={isExpanded}
                  isEditMode={isEditMode}
                  control={control}
                  onToggleExpand={() => onToggleExpand(agent.id)}
                  onRemove={onRemoveAgent ? () => onRemoveAgent(index) : undefined}
                />
              );
            })
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
                agentName={agent.name}
                agentIdValue={agent.agent_id}
                agentUrl={agent.url}
                identityType={agent.identity_type}
                identityIdentifiers={agent.identity_identifiers}
                isExpanded={agentExpandedState[agent.agent_id] ?? true}
                isEditMode={false}
                control={control}
                onToggleExpand={() => onToggleExpand(agent.agent_id)}
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
