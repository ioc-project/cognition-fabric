'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Eye, Edit, Unplug, Trash2} from 'lucide-react';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';

export interface CognitiveAgentCardListProps {
  cognitiveAgents: CognitionEngineListItem[];
  selectedId: string | null;
  onCardClick: (r: CognitionEngineListItem) => void;
  onOpenEdit: (r: CognitionEngineListItem) => void;
  onOpenDelete: (r: CognitionEngineListItem) => void;
  onToggleEnabled: (r: CognitionEngineListItem) => void;
}

export function CognitiveAgentCardList({
  cognitiveAgents,
  selectedId,
  onCardClick,
  onOpenEdit,
  onOpenDelete,
  onToggleEnabled
}: CognitiveAgentCardListProps) {
  return (
    <div className="list-grid">
      {cognitiveAgents.map((r) => (
        <Card
          key={r.id}
          variant="list"
          className={`transition-shadow duration-200 flex flex-col cursor-pointer ${selectedId === r.id ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]' : ''}`}
          onClick={() => onCardClick(r)}
        >
          <div className="pb-4 mb-5 border-b border-border/50 flex justify-between items-start">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{r.name}</span>
                <Badge variant={r.status === 'online' ? 'success' : 'inactive'}>{r.status === 'online' ? 'Online' : 'Offline'}</Badge>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCardClick(r);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenEdit(r);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
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
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenDelete(r);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mb-6">
            <div className="text-xs font-medium text-muted-foreground mb-2">ID</div>
            <div className="text-xs text-foreground font-mono break-all leading-relaxed">{r.id}</div>
          </div>

          <div className="mb-6 flex gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Version</span>
              <span className="text-sm text-foreground font-mono">{r.version}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Enabled</span>
              <Badge variant={r.enabled ? 'info' : 'inactive'}>{r.enabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Created</span>
              <span className="text-sm text-foreground">
                {r.created_at ? new Date(r.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
