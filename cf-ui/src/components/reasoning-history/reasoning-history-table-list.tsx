'use client';

import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ResourceTable} from '@/components/ui/resource-table';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Eye} from 'lucide-react';
import type {QueryHistoryListItem} from '@/api/types/reasoning-history';
import type {CognitiveAgent} from '@/api/types/cognitive-agent';
import type {MAS} from '@/api/types/mas';

export interface ReasoningHistoryTableListProps {
  items: QueryHistoryListItem[];
  cognitiveAgentById: Map<string, CognitiveAgent>;
  masById: Map<string, MAS>;
  onRowClick: (item: QueryHistoryListItem) => void;
}

export function ReasoningHistoryTableList({items, cognitiveAgentById, masById, onRowClick}: ReasoningHistoryTableListProps) {
  return (
    <ResourceTable
      items={items}
      headers={[
        {content: 'Query'},
        {content: 'MAS'},
        {content: 'Cognitive Agent'},
        {content: 'Created At'},
        {content: 'Actions', className: 'text-right'}
      ]}
      rowKey={(item) => item.id}
      onRowClick={(item) => onRowClick(item)}
      renderRow={(item) => {
        const cognitiveAgent = cognitiveAgentById.get(item.reasoner_id);
        const mas = cognitiveAgent ? masById.get(cognitiveAgent.mas_id) : null;

        return [
          {
            content: (
              <div className="max-w-md truncate" title={item.query_input}>
                {item.query_input}
              </div>
            ),
            className: 'font-medium'
          },
          {content: mas?.name || '-'},
          {content: cognitiveAgent?.name || item.reasoner_id.slice(0, 8)},
          {content: new Date(item.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)},
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
                      onRowClick(item);
                    }}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
            className: 'text-right'
          }
        ];
      }}
      emptyMessage="No reasoning history found."
    />
  );
}
