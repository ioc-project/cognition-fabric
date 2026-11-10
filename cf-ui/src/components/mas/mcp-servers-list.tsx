// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Plus, Server} from 'lucide-react';
import {useFieldArray} from 'react-hook-form';
import {Button} from '@/components/ui/button';
import {MCPServerCard} from './mcp-server-card';
import type {Control, UseFormWatch} from 'react-hook-form';

interface MCPTool {
  id?: string;
  name: string;
  description?: string;
  parameters?: string | Record<string, unknown>;
}

interface MCPServer {
  id?: string;
  name?: string;
  transport?: string;
  description?: string;
  tools?: MCPTool[];
}

interface MCPServerDetail {
  id: string;
  name: string;
  transport?: string | null;
  description?: string | null;
  tools?: Array<{
    id: string;
    name: string;
    description?: string | null;
    parameters?: Record<string, unknown> | null;
  }> | null;
}

interface MCPServersListProps {
  servers: Array<{id: string} & MCPServer>;
  control: Control<any>;
  watch: UseFormWatch<any>;
  isEditMode: boolean;
  disabled?: boolean;
  serverExpandedState: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onAddServer?: () => void;
  onRemoveServer?: (index: number) => void;
  masServersData?: MCPServerDetail[];
}

// Wrapper component to handle useFieldArray for tools
function MCPServerCardWrapper({
  server,
  index,
  control,
  watch,
  isEditMode,
  disabled,
  serverExpandedState,
  onToggleExpand,
  onRemoveServer
}: {
  server: {id: string} & MCPServer;
  index: number;
  control: Control<any>;
  watch: UseFormWatch<any>;
  isEditMode: boolean;
  disabled?: boolean;
  serverExpandedState: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onRemoveServer?: (index: number) => void;
}) {
  const toolFields = useFieldArray({control, name: `mcp_servers.${index}.tools` as const});
  const isExpanded = serverExpandedState[server.id] ?? true;
  const serverName = watch(`mcp_servers.${index}.name`);

  return (
    <MCPServerCard
      key={server.id}
      index={index}
      serverId={server.id}
      serverName={serverName}
      isExpanded={isExpanded}
      isEditMode={isEditMode}
      disabled={disabled}
      control={control}
      toolFields={toolFields}
      onToggleExpand={() => onToggleExpand(server.id)}
      onRemove={onRemoveServer ? () => onRemoveServer(index) : undefined}
    />
  );
}

export function MCPServersList({
  servers,
  control,
  watch,
  isEditMode,
  disabled,
  serverExpandedState,
  onToggleExpand,
  onAddServer,
  onRemoveServer,
  masServersData
}: MCPServersListProps) {
  const viewModeServers = masServersData
    ? masServersData.map((server) => ({
        id: server.id,
        name: server.name || '',
        transport: server.transport || '',
        description: server.description || '',
        tools: (server.tools || []).map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || {}
        }))
      }))
    : [];

  const displayServers = isEditMode ? servers : viewModeServers;
  const hasServers = displayServers.length > 0;

  return (
    <div className="space-y-4">
      {isEditMode ? (
        <>
          {!hasServers ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-3">
                <Server className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">No MCP servers added yet</p>
              {onAddServer && (
                <Button type="button" variant="sidebar" size="sm" className="gap-2" onClick={onAddServer}>
                  <Plus className="w-4 h-4" />
                  Add Your First MCP Server
                </Button>
              )}
            </div>
          ) : (
            servers.map((server, index) => (
              <MCPServerCardWrapper
                key={server.id}
                server={server}
                index={index}
                control={control}
                watch={watch}
                isEditMode={isEditMode}
                disabled={disabled}
                serverExpandedState={serverExpandedState}
                onToggleExpand={onToggleExpand}
                onRemoveServer={onRemoveServer}
              />
            ))
          )}
        </>
      ) : (
        <>
          {hasServers ? (
            viewModeServers.map((server, index) => (
              <MCPServerCard
                key={server.id}
                index={index}
                serverId={server.id}
                serverName={server.name}
                serverIdValue={server.id}
                serverTransport={server.transport}
                serverDescription={server.description}
                tools={server.tools}
                isExpanded={serverExpandedState[server.id] ?? true}
                isEditMode={false}
                control={control}
                toolFields={
                  {
                    fields: [],
                    append: () => {},
                    remove: () => {},
                    prepend: () => {},
                    insert: () => {},
                    swap: () => {},
                    move: () => {},
                    update: () => {},
                    replace: () => {}
                  } as any
                }
                onToggleExpand={() => onToggleExpand(server.id)}
              />
            ))
          ) : (
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-3">
                <Server className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No MCP servers configured</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
