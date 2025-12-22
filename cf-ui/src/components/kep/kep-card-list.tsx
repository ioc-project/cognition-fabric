'use client';

import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {routes} from '@/constants/routes';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import Link from 'next/link';
import {MoreVertical, Trash2} from 'lucide-react';
import type {KEP} from '@/api/types/kep';

export interface KEPCardListProps {
  keps: KEP[];
  workspaceId: string;
  selectedId: string | null;
  onCardClick: (k: KEP) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
}

export function KEPCardList({keps, workspaceId, selectedId, onCardClick, onOpenDelete}: KEPCardListProps) {
  return (
    <div className="list-grid">
      {keps.map((kep) => (
        <Card
          key={kep.id}
          variant="list"
          className={`transition-shadow duration-200 flex flex-col cursor-pointer ${selectedId === kep.id ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]' : ''}`}
          onClick={() => onCardClick(kep)}
        >
          <div className="pb-4 mb-5 border-b border-border/50 flex justify-between items-start">
            <div className="flex-1 mr-4">
              <div className="text-sm font-medium text-foreground">{kep.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {kep.type} • {kep.software_type}
              </div>
            </div>
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
          </div>

          <div className="mb-6">
            <div className="text-xs font-medium text-muted-foreground mb-2">ID</div>
            <div className="text-xs text-foreground font-mono break-all leading-relaxed">{kep.id}</div>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Connected MAS</span>
              <span className="text-sm text-foreground">{kep.mas_ids.length}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Created</span>
              <span className="text-sm text-foreground">
                {kep.created_at ? new Date(kep.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
              </span>
            </div>
          </div>

          <div className="mt-auto">
            <Button asChild variant="sidebar" className="w-full">
              <Link href={routes.workspaces.knowledge.details(workspaceId, kep.id)}>View Details</Link>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
