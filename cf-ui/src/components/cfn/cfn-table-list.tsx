// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Edit, Eye, ArrowUpDown, ArrowUp, ArrowDown} from 'lucide-react';
import type {Cfn} from '@/api/types/cfn';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

function SortIcon({active, dir}: {active: boolean; dir?: 'asc' | 'desc'}) {
  if (!active) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }
  return dir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

export interface CfnTableListProps {
  cfns: Cfn[];
  selectedId: string | null;
  onRowClick: (cfn: Cfn) => void;
  onOpenEdit: (cfn: Cfn) => void;
  sortConfig?: SortConfig;
  onSort?: (key: string) => void;
}

export function CfnTableList({cfns, selectedId, onRowClick, onOpenEdit, sortConfig, onSort}: CfnTableListProps) {
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
      items={cfns}
      headers={[
        sortable('name', 'Name'),
        sortable('status', 'Status'),
        {content: 'Enabled'},
        sortable('last_seen', 'Last Seen'),
        sortable('created_at', 'Created'),
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(cfn) => cfn.id}
      isSelected={(cfn) => selectedId === cfn.id}
      onRowClick={(cfn) => onRowClick(cfn)}
      renderRow={(cfn) => [
        {content: cfn.name, className: 'font-medium'},
        {
          content: <Badge variant={cfn.status === 'online' ? 'success' : cfn.status === 'offline' ? 'inactive' : 'destructive'}>{cfn.status}</Badge>
        },
        {
          content: <Badge variant={cfn.enabled ? 'info' : 'inactive'}>{cfn.enabled ? 'Enabled' : 'Disabled'}</Badge>
        },
        {
          content: cfn.last_seen ? new Date(cfn.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : '-',
          className: 'text-muted-foreground'
        },
        {content: cfn.created_at ? new Date(cfn.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
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
                    onRowClick(cfn);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEdit(cfn);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
          className: 'text-right'
        }
      ]}
    />
  );
}
