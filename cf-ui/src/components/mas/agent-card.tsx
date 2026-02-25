'use client';

import {ChevronDown, ChevronUp} from 'lucide-react';
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import type {Control} from 'react-hook-form';

interface AgentCardProps {
  index: number;
  agentId: string;
  agentName: string;
  agentUrl: string;
  remoteMemoryProviderId: string;
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
  agentUrl,
  remoteMemoryProviderId,
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
          <FormLabel className="mb-0">{agentName || `Agent ${index + 1}`}</FormLabel>
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
          <div className="grid gap-4 md:grid-cols-3">
            {isEditMode ? (
              <>
                <FormField
                  control={control}
                  name={`agents.${index}.name`}
                  render={({field}) => (
                    <FormItem>
                      <FormLabel required>Agent Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Retrieval-Agent" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name={`agents.${index}.url`}
                  render={({field}) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel required>Agent URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://agent.example.com:8000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <>
                <div>
                  <FormLabel required>Agent Name</FormLabel>
                  <Input value={agentName} disabled readOnly />
                </div>

                <div className="md:col-span-2">
                  <FormLabel required>Agent URL</FormLabel>
                  <Input value={agentUrl} disabled readOnly />
                </div>
              </>
            )}
          </div>

          {isEditMode ? (
            <FormField
              control={control}
              name={`agents.${index}.remote_memory_provider_id`}
              render={({field}) => (
                <FormItem>
                  <FormLabel required>Remote Memory Provider</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a memory provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {userMemoryProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.provider_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div>
              <FormLabel>Remote Memory Provider</FormLabel>
              <Input
                value={userMemoryProviders.find((p) => p.id === remoteMemoryProviderId)?.provider_name || remoteMemoryProviderId}
                disabled
                readOnly
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
