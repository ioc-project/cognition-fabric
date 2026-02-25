'use client';

import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import Link from 'next/link';
import {MoreVertical, Shield} from 'lucide-react';
import type {CognitiveAgentListItem} from '@/api/types/cognitive-agent';

export interface CognitiveAgentCardListProps {
  cognitiveAgents: CognitiveAgentListItem[];
  workspaceId: string;
  selectedId: string | null;
  onCardClick: (r: CognitiveAgentListItem) => void;
}

export function CognitiveAgentCardList({cognitiveAgents, workspaceId, selectedId, onCardClick}: CognitiveAgentCardListProps) {
  return (
    <div className="list-grid">
      {cognitiveAgents.map((r) => (
        <Card
          key={r.cognitive_agent_id}
          variant="list"
          className={`transition-shadow duration-200 flex flex-col cursor-pointer ${selectedId === r.cognitive_agent_id ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]' : ''}`}
          onClick={() => onCardClick(r)}
        >
          <div className="pb-4 mb-5 border-b border-border/50 flex justify-between items-start">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{r.cognitive_agent_name}</span>
                {!r.enabled && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    <Shield className="w-3 h-3" />
                    Disabled
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{r.description || 'No description'}</div>
            </div>
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
          </div>

          <div className="mb-6">
            <div className="text-xs font-medium text-muted-foreground mb-2">ID</div>
            <div className="text-xs text-foreground font-mono break-all leading-relaxed">{r.cognitive_agent_id}</div>
          </div>

          <div className="mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Created</span>
              <span className="text-sm text-foreground">
                {r.created_at ? new Date(r.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
              </span>
            </div>
          </div>

          <div className="mt-auto">
            <Button asChild variant="sidebar" className="w-full">
              <Link href={routes.workspaces.cognitiveAgents.details(workspaceId, r.cognitive_agent_id)}>View Details</Link>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
