// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {routes} from '@/constants/routes';
import {formatTimestamp} from '@/lib/utils';
import Link from 'next/link';
import {MoreVertical, Trash2, Eye, Edit} from 'lucide-react';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';

export interface MASCardListProps {
  masList: MultiAgenticSystem[];
  workspaceId: string;
  selectedId: string | null;
  onCardClick: (m: MultiAgenticSystem) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
  onOpenEdit: (m: MultiAgenticSystem) => void;
}

export function MASCardList({masList, workspaceId, selectedId, onCardClick, onOpenDelete, onOpenEdit}: MASCardListProps) {
  return (
    <div className="list-grid">
      {masList.map((mas) => (
        <Card
          key={mas.id}
          variant="list"
          className={`transition-shadow duration-200 flex flex-col cursor-pointer ${selectedId === mas.id ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]' : ''}`}
          onClick={() => onCardClick(mas)}
        >
          <div className="pb-4 mb-5 border-b border-border/50 flex justify-between items-start">
            <div className="flex-1 mr-4">
              <div className="text-sm font-medium text-foreground">{mas.name}</div>
              {mas.description && <div className="text-xs text-muted-foreground mt-1">{mas.description}</div>}
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
                    onCardClick(mas);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
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
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenDelete({id: mas.id, name: mas.name});
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
            <div className="text-xs text-foreground font-mono break-all leading-relaxed">{mas.id}</div>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Created</span>
              <span className="text-sm text-foreground">{mas.created_at ? formatTimestamp(mas.created_at) : 'Unknown'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Last Updated</span>
              <span className="text-sm text-foreground">{mas.updated_at ? formatTimestamp(mas.updated_at) : 'Unknown'}</span>
            </div>
          </div>

          <div className="mt-auto">
            <Button asChild variant="sidebar" className="w-full">
              <Link href={routes.workspaces.mas.details(workspaceId, mas.id)}>View Details</Link>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
