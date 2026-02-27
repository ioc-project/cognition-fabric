'use client';

import {ChevronDown, ChevronUp} from 'lucide-react';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import type {Control} from 'react-hook-form';

interface AgentCardProps {
  index: number;
  agentId: string;
  agentIdValue: string;
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
  agentIdValue,
  agenticMemoryProviderId,
  agenticMemoryProviderName,
  isExpanded,
  isEditMode,
  control,
  onToggleExpand,
  onRemove,
  userMemoryProviders = []
}: AgentCardProps) {
  return (
    <div className="rounded-md border p-4 space-y-4" style={{backgroundColor: 'hsl(216.7, 100%, 95.5%)'}}>
      <div className="flex items-center justify-between">
        <div className={isEditMode ? 'cursor-pointer' : ''} onClick={isEditMode ? onToggleExpand : undefined}>
          <FormLabel className="mb-0">{agentIdValue || `Agent ${index + 1}`}</FormLabel>
        </div>
        {isEditMode && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-5 w-5 p-0 text-xs leading-none inline-flex items-center justify-center rounded bg-white hover:bg-gray-100"
              onClick={onToggleExpand}
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {onRemove && (
              <button
                type="button"
                className="h-5 w-5 p-0 text-xs leading-none inline-flex items-center justify-center rounded bg-white hover:bg-gray-100"
                onClick={onRemove}
              >
                X
              </button>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          <div>
            {isEditMode ? (
              <FormField
                control={control}
                name={`agents.${index}.agent_id`}
                render={({field}) => (
                  <FormItem>
                    <FormLabel required>Agent ID</FormLabel>
                    <FormControl>
                      <Input placeholder="retrieval-agent-1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div>
                <FormLabel required>Agent ID</FormLabel>
                <Input value={agentIdValue} disabled readOnly />
              </div>
            )}
          </div>

          {isEditMode ? (
            <FormField
              control={control}
              name={`agents.${index}.agentic_memory_provider_id`}
              render={({field}) => (
                <FormItem>
                  <FormLabel>Agentic Memory Provider</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a memory provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {userMemoryProviders.length === 0 ? (
                        <div className="py-2 px-2 text-sm text-muted-foreground">No agentic memory providers available</div>
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
          ) : (
            agenticMemoryProviderId && (
              <div>
                <FormLabel>Agentic Memory Provider</FormLabel>
                <Input value={agenticMemoryProviderName || agenticMemoryProviderId} disabled readOnly />
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
