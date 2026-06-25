// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {ChevronDown, ChevronUp, X} from 'lucide-react';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {CopyableInput} from '@/components/ui/copyable-input';
import {ReadOnlyField} from '@/components/ui/read-only-field';
import {Label} from '@/components/ui/label';
import {validateJSON, formatJson} from '@/lib/utils';
import type {Control} from 'react-hook-form';

interface AgentCardProps {
  index: number;
  agentId: string;
  agentName?: string;
  agentIdValue?: string;
  agentUrl?: string;
  identityType?: string;
  identityIdentifiers?: Record<string, string>;
  agenticMemoryProviderId?: string;
  agenticMemoryProviderName?: string;
  isExpanded: boolean;
  isEditMode: boolean;
  control: Control<any>;
  onToggleExpand: () => void;
  onRemove?: () => void;
  userMemoryProviders?: Array<{id: string; provider_name: string}>;
}

export function AgentCard({
  index,
  agentId: _agentId,
  agentName,
  agentIdValue,
  agentUrl,
  identityType,
  identityIdentifiers,
  agenticMemoryProviderId,
  agenticMemoryProviderName,
  isExpanded,
  isEditMode,
  control,
  onToggleExpand,
  onRemove,
  userMemoryProviders = []
}: AgentCardProps) {
  const headerLabel = agentName || agentIdValue || `Agent ${index + 1}`;

  return (
    <div className="rounded-lg border border-border p-4 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <div className={isEditMode ? 'cursor-pointer' : ''} onClick={isEditMode ? onToggleExpand : undefined}>
          <FormLabel className="mb-0">{headerLabel}</FormLabel>
        </div>
        {isEditMode && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-5 w-5 p-0 text-xs leading-none inline-flex items-center justify-center rounded bg-background hover:bg-muted border border-border"
              onClick={onToggleExpand}
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {onRemove && (
              <button
                type="button"
                className="h-5 w-5 p-0 text-xs leading-none inline-flex items-center justify-center rounded bg-background hover:bg-muted border border-border"
                onClick={onRemove}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          {isEditMode ? (
            <EditModeFields index={index} control={control} userMemoryProviders={userMemoryProviders} />
          ) : (
            <ViewModeFields
              agentIdValue={agentIdValue}
              agentName={agentName}
              agentUrl={agentUrl}
              identityType={identityType}
              identityIdentifiers={identityIdentifiers}
              agenticMemoryProviderId={agenticMemoryProviderId}
              agenticMemoryProviderName={agenticMemoryProviderName}
            />
          )}
        </>
      )}
    </div>
  );
}

function EditModeFields({
  index,
  control,
  userMemoryProviders
}: {
  index: number;
  control: Control<any>;
  userMemoryProviders: Array<{id: string; provider_name: string}>;
}) {
  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name={`agents.${index}.name`}
        render={({field}) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Retrieval Agent" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`agents.${index}.url`}
        render={({field}) => (
          <FormItem>
            <FormLabel>URL</FormLabel>
            <FormControl>
              <Input placeholder="e.g. http://agent:8080" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`agents.${index}.identity_type`}
        render={({field}) => (
          <FormItem>
            <FormLabel>Identity Type</FormLabel>
            <FormControl>
              <Input placeholder="e.g. openclaw, claude_code, foo/bar" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`agents.${index}.identity_identifiers`}
        render={({field}) => (
          <FormItem>
            <div className="flex items-center gap-2">
              <FormLabel>Identity Identifiers</FormLabel>
              {field.value && field.value.trim() !== '' && (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${validateJSON(field.value) ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}
                >
                  {validateJSON(field.value) ? 'Valid JSON' : 'Invalid JSON'}
                </span>
              )}
            </div>
            <FormControl>
              <Textarea
                placeholder={'{\n  "url": "main::agents::retrieval-agent-1"\n}'}
                className="font-mono text-sm min-h-[80px] resize-y"
                {...field}
                onBlur={() => field.onChange(formatJson(field.value || ''))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`agents.${index}.agentic_memory_provider_id`}
        render={({field}) => (
          <FormItem>
            <FormLabel>Memory Provider</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a memory provider" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {userMemoryProviders.length === 0 ? (
                  <div className="py-2 px-2 text-sm text-muted-foreground">No memory providers available</div>
                ) : (
                  userMemoryProviders.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.provider_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function ViewModeFields({
  agentIdValue,
  agentName,
  agentUrl,
  identityType,
  identityIdentifiers,
  agenticMemoryProviderId,
  agenticMemoryProviderName
}: {
  agentIdValue?: string;
  agentName?: string;
  agentUrl?: string;
  identityType?: string;
  identityIdentifiers?: Record<string, string>;
  agenticMemoryProviderId?: string;
  agenticMemoryProviderName?: string;
}) {
  return (
    <div className="space-y-3">
      {agentIdValue && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Agent ID</Label>
          <CopyableInput value={agentIdValue} />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Name</Label>
        <ReadOnlyField value={agentName || '—'} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">URL</Label>
        <ReadOnlyField value={agentUrl || '—'} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Identity Type</Label>
        <ReadOnlyField value={identityType || 'Not configured'} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Identity Identifiers</Label>
        <pre className="font-mono text-xs rounded-md border bg-muted/40 p-3 min-h-[80px] whitespace-pre-wrap break-all text-foreground">
          {identityIdentifiers && Object.keys(identityIdentifiers).length > 0
            ? JSON.stringify(identityIdentifiers, null, 2)
            : '{\n  "url": "main::agents::retrieval-agent-1"\n}'}
        </pre>
      </div>

      {agenticMemoryProviderId && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Memory Provider</Label>
          <ReadOnlyField value={agenticMemoryProviderName || agenticMemoryProviderId || ''} />
          <div className="pt-1">
            <Label className="text-xs text-muted-foreground">Provider ID</Label>
            <CopyableInput value={agenticMemoryProviderId} />
          </div>
        </div>
      )}
    </div>
  );
}
