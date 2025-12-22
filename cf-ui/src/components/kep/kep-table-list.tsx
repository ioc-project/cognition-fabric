'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import Link from 'next/link';
import {MoreVertical, Trash2} from 'lucide-react';
import type {KEP} from '@/api/types/kep';

export interface KEPTableListProps {
  keps: KEP[];
  workspaceId: string;
  selectedId: string | null;
  onRowClick: (k: KEP) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
}

export function KEPTableList({keps, workspaceId, selectedId, onRowClick, onOpenDelete}: KEPTableListProps) {
  return (
    <ResourceTable
      items={keps}
      headers={[
        {content: 'Name'},
        {content: 'Type'},
        {content: 'Connected MAS'},
        {content: 'Created'},
        {content: 'Updated'},
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(kep) => kep.id}
      isSelected={(kep) => selectedId === kep.id}
      onRowClick={(kep) => onRowClick(kep)}
      renderRow={(kep) => [
        {content: kep.name, className: 'font-medium'},
        {content: kep.type},
        {content: kep.mas_ids.length},
        {content: kep.created_at ? new Date(kep.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
        {content: kep.updated_at ? new Date(kep.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
        {
          content: (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={routes.workspaces.knowledge.details(workspaceId, kep.id)}>View Details</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDelete({id: kep.id, name: kep.name});
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
