'use client';

import {ChevronDown, ChevronUp, X, Bot} from 'lucide-react';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {CopyableInput} from '@/components/ui/copyable-input';
import {validateJSON, formatJson} from '@/lib/utils';
import {dtLabel, dtValue, dtRow} from '@/lib/detail-typography';
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
            <Bot size={13} className="text-[hsl(var(--sidebar-icon-active))]" />
          </div>
          <div className="text-left">
            <div className="text-sm text-foreground font-medium">{headerLabel}</div>
            {agentIdValue && (
              <div className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">{agentIdValue}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
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
          {isExpanded ? (
            <ChevronUp size={13} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={13} className="text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border bg-card">
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
        </div>
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
    <div className="space-y-4 pt-4">
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
  const rowClass = dtRow;
  const labelClass = dtLabel;
  const valueClass = dtValue;

  return (
    <div>
      {agentIdValue && (
        <div className={rowClass}>
          <span className={labelClass}>Agent ID</span>
          <CopyableInput value={agentIdValue} />
        </div>
      )}

      <div className={rowClass}>
        <span className={labelClass}>Name</span>
        <span className={valueClass}>{agentName || '-'}</span>
      </div>

      <div className={rowClass}>
        <span className={labelClass}>URL</span>
        <span className={valueClass}>{agentUrl || '-'}</span>
      </div>

      <div className={rowClass}>
        <span className={labelClass}>Identity Type</span>
        <span className={valueClass}>{identityType || '-'}</span>
      </div>

      <div className={rowClass}>
        <span className={labelClass}>Identifiers</span>
        <pre className="font-mono text-sm text-muted-foreground bg-muted border border-border rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">
          {identityIdentifiers && Object.keys(identityIdentifiers).length > 0
            ? JSON.stringify(identityIdentifiers, null, 2)
            : '{\n  "url": "main::agents::retrieval-agent-1"\n}'}
        </pre>
      </div>

      {agenticMemoryProviderId && (
        <div className={rowClass}>
          <span className={labelClass}>Memory Provider</span>
          <div className="space-y-1">
            <span className={valueClass}>{agenticMemoryProviderName || agenticMemoryProviderId}</span>
            <CopyableInput value={agenticMemoryProviderId} />
          </div>
        </div>
      )}
    </div>
  );
}
