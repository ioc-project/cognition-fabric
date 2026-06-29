// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {TruncatedText} from '@/components/ui/truncated-text';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Trash2, Edit, Eye, ArrowUpDown, ArrowUp, ArrowDown} from 'lucide-react';
import type {MemoryProvider} from '@/api/types/memory-provider';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

function SortIcon({active, dir}: {active: boolean; dir?: 'asc' | 'desc'}) {
  if (!active) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }
  return dir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

export interface MemoryProviderTableListProps {
  providers: MemoryProvider[];
  selectedId: string | null;
  onRowClick: (provider: MemoryProvider) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
  onOpenEdit: (provider: MemoryProvider) => void;
  sortConfig?: SortConfig;
  onSort?: (key: string) => void;
}

export function MemoryProviderTableList({
  providers,
  selectedId,
  onRowClick,
  onOpenDelete,
  onOpenEdit,
  sortConfig,
  onSort
}: MemoryProviderTableListProps) {
  const sortable = (key: string, label: string) => ({
    content: (
      <span className="flex items-center">
        {label}
        <SortIcon active={sortConfig?.key === key} dir={sortConfig?.dir} />
      </span>
    ),
    className: 'cursor-pointer select-none hover:text-foreground',
    onClick: () => onSort?.(key)
  });

  return (
    <ResourceTable
      items={providers}
      headers={[
        sortable('name', 'Name'),
        {content: 'Description'},
        {content: 'Status'},
        sortable('created_at', 'Created'),
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(provider) => provider.id}
      isSelected={(provider) => selectedId === provider.id}
      onRowClick={(provider) => onRowClick(provider)}
      renderRow={(provider) => [
        {
          content: (
            <div className="flex items-center gap-2">
              <span className="font-medium">{provider.name}</span>
            </div>
          )
        },
        {
          content: provider.description ? <TruncatedText text={provider.description} maxLength={50} /> : '-',
          className: ''
        },
        {
          content: <Badge variant={provider.enabled ? 'info' : 'inactive'}>{provider.enabled ? 'Enabled' : 'Disabled'}</Badge>
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
                    onRowClick(provider);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                {provider.name !== 'ioc-memory-provider' && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEdit(provider);
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 dark:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDelete({id: provider.id, name: provider.name});
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>
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
