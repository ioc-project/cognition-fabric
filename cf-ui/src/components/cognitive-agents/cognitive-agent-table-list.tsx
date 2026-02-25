'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import Link from 'next/link';
import {MoreVertical, Shield} from 'lucide-react';
import type {CognitiveAgentListItem} from '@/api/types/cognitive-agent';

export interface CognitiveAgentTableListProps {
  cognitiveAgents: CognitiveAgentListItem[];
  workspaceId: string;
  selectedId: string | null;
  onRowClick: (r: CognitiveAgentListItem) => void;
}

export function CognitiveAgentTableList({cognitiveAgents, workspaceId, selectedId, onRowClick}: CognitiveAgentTableListProps) {
  return (
    <ResourceTable
      items={cognitiveAgents}
      headers={[{content: 'Name'}, {content: 'Description'}, {content: 'Created'}, {content: 'Actions', className: 'text-right'}]}
      rowKey={(r) => r.cognitive_agent_id}
      isSelected={(r) => selectedId === r.cognitive_agent_id}
      onRowClick={(r) => onRowClick(r)}
      renderRow={(r) => [
        {
          content: (
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.cognitive_agent_name}</span>
              {!r.enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  <Shield className="w-3 h-3" />
                  Disabled
                </span>
              )}
            </div>
          )
        },
        {content: r.description || 'N/A'},
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
                <DropdownMenuItem asChild>
                  <Link href={routes.workspaces.cognitiveAgents.details(workspaceId, r.cognitive_agent_id)}>View Details</Link>
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
