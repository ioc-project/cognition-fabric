'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import Link from 'next/link';
import {MoreVertical} from 'lucide-react';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';

export interface CognitiveAgentTableListProps {
  cognitiveAgents: CognitionEngineListItem[];
  selectedId: string | null;
  onRowClick: (r: CognitionEngineListItem) => void;
}

export function CognitiveAgentTableList({cognitiveAgents, selectedId, onRowClick}: CognitiveAgentTableListProps) {
  return (
    <ResourceTable
      items={cognitiveAgents}
      headers={[{content: 'Name'}, {content: 'Status'}, {content: 'Created'}, {content: 'Actions', className: 'text-right'}]}
      rowKey={(r) => r.id}
      isSelected={(r) => selectedId === r.id}
      onRowClick={(r) => onRowClick(r)}
      renderRow={(r) => [
        {
          content: <span className="font-medium">{r.name}</span>
        },
        {
          content: (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                r.enabled
                  ? 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
              }`}
            >
              {r.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )
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
                <DropdownMenuItem asChild>
                  <Link href={routes.cognitiveAgents.details(r.id)}>View Details</Link>
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
