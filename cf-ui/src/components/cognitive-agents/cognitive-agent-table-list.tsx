'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Eye, Edit, Unplug, Trash2, ArrowUpDown, ArrowUp, ArrowDown} from 'lucide-react';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

function SortIcon({active, dir}: {active: boolean; dir?: 'asc' | 'desc'}) {
  if (!active) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }
  return dir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

export interface CognitiveAgentTableListProps {
  cognitiveAgents: CognitionEngineListItem[];
  selectedId: string | null;
  onRowClick: (r: CognitionEngineListItem) => void;
  onOpenEdit: (r: CognitionEngineListItem) => void;
  onOpenDelete: (r: CognitionEngineListItem) => void;
  onToggleEnabled: (r: CognitionEngineListItem) => void;
  sortConfig?: SortConfig;
  onSort?: (key: string) => void;
}

export function CognitiveAgentTableList({
  cognitiveAgents,
  selectedId,
  onRowClick,
  onOpenEdit,
  onOpenDelete,
  onToggleEnabled,
  sortConfig,
  onSort
}: CognitiveAgentTableListProps) {
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
      items={cognitiveAgents}
      headers={[
        sortable('name', 'Name'),
        sortable('status', 'Status'),
        {content: 'Version'},
        {content: 'Enabled'},
        sortable('created_at', 'Created'),
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(r) => r.id}
      isSelected={(r) => selectedId === r.id}
      onRowClick={(r) => onRowClick(r)}
      renderRow={(r) => [
        {
          content: <span className="font-medium">{r.name}</span>
        },
        {
          content: <Badge variant={r.status === 'online' ? 'success' : 'inactive'}>{r.status === 'online' ? 'Online' : 'Offline'}</Badge>
        },
        {content: <span className="font-mono text-xs">{r.version}</span>},
        {
          content: <Badge variant={r.enabled ? 'info' : 'inactive'}>{r.enabled ? 'Enabled' : 'Disabled'}</Badge>
        },
        {content: r.created_at ? new Date(r.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
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
                    onRowClick(r);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEdit(r);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleEnabled(r);
                  }}
                >
                  <Unplug className="w-4 h-4 mr-2" />
                  {r.enabled ? 'Disable' : 'Enable'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400"
                  disabled={r.enabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDelete(r);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
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
