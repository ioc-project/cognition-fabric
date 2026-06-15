'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {TruncatedText} from '@/components/ui/truncated-text';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Trash2, Eye, Edit, ArrowUpDown, ArrowUp, ArrowDown} from 'lucide-react';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';

type SortConfig = {key: string; dir: 'asc' | 'desc'} | null;

function SortIcon({active, dir}: {active: boolean; dir?: 'asc' | 'desc'}) {
  if (!active) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }
  return dir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

export interface MASTableListProps {
  masList: MultiAgenticSystem[];
  workspaceId: string;
  selectedId: string | null;
  onRowClick: (m: MultiAgenticSystem) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
  onOpenEdit: (m: MultiAgenticSystem) => void;
  sortConfig?: SortConfig;
  onSort?: (key: string) => void;
}

export function MASTableList({
  masList,
  workspaceId: _workspaceId,
  selectedId,
  onRowClick,
  onOpenDelete,
  onOpenEdit,
  sortConfig,
  onSort
}: MASTableListProps) {
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
      items={masList}
      headers={[
        sortable('name', 'Name'),
        {content: 'Description'},
        sortable('created_at', 'Created'),
        sortable('updated_at', 'Last Updated'),
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(mas) => mas.id}
      isSelected={(mas) => selectedId === mas.id}
      onRowClick={(mas) => onRowClick(mas)}
      renderRow={(mas) => [
        {content: mas.name, className: 'font-medium'},
        {
          content: mas.description ? <TruncatedText text={mas.description} maxLength={50} className="text-muted-foreground" /> : '-',
          className: 'text-muted-foreground'
        },
        {content: mas.created_at ? new Date(mas.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
        {content: mas.updated_at ? new Date(mas.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
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
                    onRowClick(mas);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEdit(mas);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDelete({id: mas.id, name: mas.name});
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
