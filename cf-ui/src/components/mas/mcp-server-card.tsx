// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {ChevronDown, ChevronUp, X, Server, Wrench, Plus, Trash2} from 'lucide-react';
import {InlineId} from '@/components/ui/inline-id';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {validateJSON, formatJson} from '@/lib/utils';
import {dtLabel, dtValue, dtRow} from '@/lib/detail-typography';
import type {Control, UseFieldArrayReturn} from 'react-hook-form';

interface MCPToolProps {
  id: string;
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface MCPServerCardProps {
  index: number;
  serverId: string;
  serverName?: string;
  serverIdValue?: string;
  serverTransport?: string;
  serverDescription?: string;
  tools?: MCPToolProps[];
  isExpanded: boolean;
  isEditMode: boolean;
  control: Control<any>;
  toolFields: UseFieldArrayReturn<any, `mcp_servers.${number}.tools`, 'id'>;
  onToggleExpand: () => void;
  onRemove?: () => void;
}

export function MCPServerCard({
  index,
  serverId: _serverId,
  serverName,
  serverIdValue,
  serverTransport,
  serverDescription,
  tools,
  isExpanded,
  isEditMode,
  control,
  toolFields,
  onToggleExpand,
  onRemove
}: MCPServerCardProps) {
  const headerLabel = serverName || serverIdValue || `MCP Server ${index + 1}`;

  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between px-4 py-3 bg-[hsl(var(--border)/0.5)] hover:brightness-95 transition-all cursor-pointer"
        onClick={onToggleExpand}
        onKeyDown={(e) => e.key === 'Enter' && onToggleExpand()}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-[hsl(var(--sidebar-icon-active)/0.1)] flex items-center justify-center">
            <Server size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
          </div>
          <div className="text-left">
            <div className="text-sm text-foreground font-medium">{headerLabel}</div>
            {serverIdValue && <InlineId label="ID" value={serverIdValue} />}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {tools && tools.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {tools.length} tool{tools.length !== 1 ? 's' : ''}
            </span>
          )}
          {isEditMode && onRemove && (
            <button
              type="button"
              className="h-5 w-5 inline-flex items-center justify-center rounded bg-card hover:bg-red-50 border border-border text-muted-foreground hover:text-red-500 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X size={11} />
            </button>
          )}
          {isExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border bg-card">
          {isEditMode ? (
            <EditModeFields index={index} control={control} toolFields={toolFields} />
          ) : (
            <ViewModeFields serverName={serverName} serverTransport={serverTransport} serverDescription={serverDescription} tools={tools} />
          )}
        </div>
      )}
    </div>
  );
}

function EditModeFields({
  index,
  control,
  toolFields
}: {
  index: number;
  control: Control<any>;
  toolFields: UseFieldArrayReturn<any, `mcp_servers.${number}.tools`, 'id'>;
}) {
  return (
    <div className="space-y-4 pt-4">
      <FormField
        control={control}
        name={`mcp_servers.${index}.name`}
        render={({field}) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g. filesystem" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`mcp_servers.${index}.description`}
        render={({field}) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea placeholder="e.g. Provides file system access capabilities" className="min-h-[60px] resize-y" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`mcp_servers.${index}.transport`}
        render={({field}) => (
          <FormItem>
            <FormLabel>Transport</FormLabel>
            <FormControl>
              <Input placeholder="e.g. stdio, sse" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Tools Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <FormLabel className="text-sm font-medium">Tools</FormLabel>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => toolFields.append({name: '', description: '', parameters: ''})}
          >
            <Plus size={12} />
            Add Tool
          </Button>
        </div>

        {toolFields.fields.length === 0 ? (
          <div className="border border-dashed rounded p-4 text-center text-sm text-muted-foreground">
            No tools defined. Click "Add Tool" to add one.
          </div>
        ) : (
          <div className="space-y-3">
            {toolFields.fields.map((tool, toolIndex) => (
              <div key={tool.id} className="border border-border rounded p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench size={12} className="text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Tool {toolIndex + 1}</span>
                  </div>
                  <button
                    type="button"
                    className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                    onClick={() => toolFields.remove(toolIndex)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                <FormField
                  control={control}
                  name={`mcp_servers.${index}.tools.${toolIndex}.name`}
                  render={({field}) => (
                    <FormItem>
                      <FormLabel className="text-xs">Tool Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. read_file" className="h-8 text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name={`mcp_servers.${index}.tools.${toolIndex}.description`}
                  render={({field}) => (
                    <FormItem>
                      <FormLabel className="text-xs">Tool Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="e.g. Reads the contents of a file" className="min-h-[50px] resize-y text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name={`mcp_servers.${index}.tools.${toolIndex}.parameters`}
                  render={({field}) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-xs">Parameters (JSON Schema)</FormLabel>
                        {field.value && field.value.trim() !== '' && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${validateJSON(field.value) ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}
                          >
                            {validateJSON(field.value) ? 'Valid' : 'Invalid'}
                          </span>
                        )}
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
                          className="font-mono text-xs min-h-[60px] resize-y"
                          {...field}
                          onBlur={() => field.onChange(formatJson(field.value || ''))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ViewModeFields({
  serverName,
  serverTransport,
  serverDescription,
  tools
}: {
  serverName?: string;
  serverTransport?: string;
  serverDescription?: string;
  tools?: MCPToolProps[];
}) {
  const rowClass = dtRow;
  const labelClass = dtLabel;
  const valueClass = dtValue;

  return (
    <div className="pt-4">
      <div className={rowClass}>
        <span className={labelClass}>Name</span>
        <span className={valueClass}>{serverName || '-'}</span>
      </div>

      <div className={rowClass}>
        <span className={labelClass}>Description</span>
        <span className={valueClass}>{serverDescription || '-'}</span>
      </div>

      <div className={rowClass}>
        <span className={labelClass}>Transport</span>
        <span className={valueClass}>{serverTransport || '-'}</span>
      </div>

      {/* Tools Section */}
      <div className="mt-4">
        <span className={labelClass}>Tools</span>
        {tools && tools.length > 0 ? (
          <div className="mt-2 space-y-2">
            {tools.map((tool, idx) => (
              <div key={tool.id || idx} className="border border-border rounded p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench size={12} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{tool.name}</span>
                </div>
                {tool.description && <p className="text-xs text-muted-foreground mb-2">{tool.description}</p>}
                {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                  <pre className="font-mono text-xs text-muted-foreground bg-muted border border-border rounded px-2 py-1 whitespace-pre-wrap">
                    {JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">No tools defined</p>
        )}
      </div>
    </div>
  );
}
