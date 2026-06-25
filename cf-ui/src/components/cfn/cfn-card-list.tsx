// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Edit, Eye} from 'lucide-react';
import type {Cfn} from '@/api/types/cfn';

export interface CfnCardListProps {
  cfns: Cfn[];
  selectedId: string | null;
  onCardClick: (cfn: Cfn) => void;
  onOpenEdit: (cfn: Cfn) => void;
}

export function CfnCardList({cfns, selectedId, onCardClick, onOpenEdit}: CfnCardListProps) {
  return (
    <div className="list-grid">
      {cfns.map((cfn) => (
        <Card
          key={cfn.id}
          variant="list"
          className={`transition-shadow duration-200 flex flex-col cursor-pointer ${selectedId === cfn.id ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]' : ''}`}
          onClick={() => onCardClick(cfn)}
        >
          <div className="pb-4 mb-5 border-b border-border/50 flex justify-between items-start">
            <div className="flex-1 mr-4">
              <div className="text-sm font-medium text-foreground">{cfn.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                <Badge variant={cfn.status === 'online' ? 'success' : cfn.status === 'offline' ? 'inactive' : 'destructive'}>{cfn.status}</Badge>
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
                    onCardClick(cfn);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenEdit(cfn);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mb-6">
            <div className="text-xs font-medium text-muted-foreground mb-2">CFN ID</div>
            <div className="text-xs text-foreground font-mono break-all leading-relaxed">{cfn.id}</div>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Created</span>
              <span className="text-sm text-foreground">
                {cfn.created_at ? new Date(cfn.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
              </span>
            </div>
            {cfn.updated_at && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Last Updated</span>
                <span className="text-sm text-foreground">{new Date(cfn.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
              </div>
            )}
            {cfn.last_seen && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Last Seen</span>
                <span className="text-sm text-foreground">{new Date(cfn.last_seen).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
