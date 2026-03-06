'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {TruncatedText} from '@/components/ui/truncated-text';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Trash2, Edit} from 'lucide-react';
import type {MemoryProvider} from '@/api/types/memory-provider';

export interface MemoryProviderTableListProps {
  providers: MemoryProvider[];
  selectedId: string | null;
  onRowClick: (provider: MemoryProvider) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
  onOpenEdit: (provider: MemoryProvider) => void;
}

export function MemoryProviderTableList({providers, selectedId, onRowClick, onOpenDelete, onOpenEdit}: MemoryProviderTableListProps) {
  return (
    <ResourceTable
      items={providers}
      headers={[
        {content: 'Name'},
        {content: 'Description'},
        {content: 'Status'},
        {content: 'Created'},
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(provider) => provider.memory_provider_id}
      isSelected={(provider) => selectedId === provider.memory_provider_id}
      onRowClick={(provider) => onRowClick(provider)}
      renderRow={(provider) => [
        {
          content: (
            <div className="flex items-center gap-2">
              <span className="font-medium">{provider.memory_provider_name}</span>
            </div>
          )
        },
        {
          content: provider.description ? <TruncatedText text={provider.description} maxLength={50} className="text-muted-foreground" /> : '-',
          className: 'text-muted-foreground'
        },
        {
          content: (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-400">
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )
        },
        {
          content: provider.created_at ? new Date(provider.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'
        },
        {
          content: (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEdit(provider);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                {provider.memory_provider_name !== 'ioc-memory-provider' && (
                  <DropdownMenuItem
                    className="text-red-600 dark:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDelete({id: provider.memory_provider_id, name: provider.memory_provider_name});
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ),
          className: 'text-right'
        }
      ]}
    />
  );
}
