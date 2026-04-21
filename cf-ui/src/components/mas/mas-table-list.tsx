'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {TruncatedText} from '@/components/ui/truncated-text';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Trash2, Eye, Edit} from 'lucide-react';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';

export interface MASTableListProps {
  masList: MultiAgenticSystem[];
  workspaceId: string;
  selectedId: string | null;
  onRowClick: (m: MultiAgenticSystem) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
  onOpenEdit: (m: MultiAgenticSystem) => void;
}

export function MASTableList({masList, workspaceId: _workspaceId, selectedId, onRowClick, onOpenDelete, onOpenEdit}: MASTableListProps) {
  return (
    <ResourceTable
      items={masList}
      headers={[
        {content: 'Name'},
        {content: 'Description'},
        {content: 'Created'},
        {content: 'Last Updated'},
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
