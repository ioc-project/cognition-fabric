'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import Link from 'next/link';
import {MoreVertical, Trash2} from 'lucide-react';
import type {CognitiveAgent} from '@/api/types/cognitive-agent';

export interface CognitiveAgentTableListProps {
  cognitiveAgents: CognitiveAgent[];
  workspaceId: string;
  selectedId: string | null;
  onRowClick: (r: CognitiveAgent) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
  masById: Map<string, string>;
}

export function CognitiveAgentTableList({cognitiveAgents, workspaceId, selectedId, onRowClick, onOpenDelete, masById}: CognitiveAgentTableListProps) {
  return (
    <ResourceTable
      items={cognitiveAgents}
      headers={[{content: 'Name'}, {content: 'MAS'}, {content: 'Created'}, {content: 'Updated'}, {content: 'Actions', className: 'text-right'}]}
      rowKey={(r) => r.id}
      isSelected={(r) => selectedId === r.id}
      onRowClick={(r) => onRowClick(r)}
      renderRow={(r) => [
        {content: r.name, className: 'font-medium'},
        {content: masById.get(r.mas_id) || r.mas_id},
        {content: r.created_at ? new Date(r.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
        {content: r.updated_at ? new Date(r.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'},
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
                  <Link href={routes.workspaces.cognitiveAgents.details(workspaceId, r.id)}>View Details</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDelete({id: r.id, name: r.name});
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
