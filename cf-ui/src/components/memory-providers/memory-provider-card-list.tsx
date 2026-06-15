'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {DATE_TIME_FORMAT_OPTIONS} from '@/lib/utils';
import {MoreVertical, Trash2, Edit, Eye} from 'lucide-react';
import type {MemoryProvider} from '@/api/types/memory-provider';

export interface MemoryProviderCardListProps {
  providers: MemoryProvider[];
  selectedId: string | null;
  onCardClick: (provider: MemoryProvider) => void;
  onOpenDelete: (payload: {id: string; name: string}) => void;
  onOpenEdit: (provider: MemoryProvider) => void;
}

export function MemoryProviderCardList({providers, selectedId, onCardClick, onOpenDelete, onOpenEdit}: MemoryProviderCardListProps) {
  return (
    <div className="list-grid">
      {providers.map((provider) => (
        <Card
          key={provider.id}
          variant="list"
          className={`transition-shadow duration-200 flex flex-col cursor-pointer ${selectedId === provider.id ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-text-active))]' : ''}`}
          onClick={() => onCardClick(provider)}
        >
          <div className="pb-4 mb-5 border-b border-border/50 flex justify-between items-start">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{provider.name}</span>
                <Badge variant={provider.enabled ? 'success' : 'inactive'}>{provider.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              {provider.description && <div className="text-xs text-muted-foreground mt-1">{provider.description}</div>}
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
                    onCardClick(provider);
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                {provider.name !== 'ioc-memory-provider' && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenEdit(provider);
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
                        onOpenDelete({id: provider.id, name: provider.name});
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Created</span>
              <span className="text-sm text-foreground">
                {provider.created_at ? new Date(provider.created_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS) : 'Unknown'}
              </span>
            </div>
            {provider.updated_at && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Last Updated</span>
                <span className="text-sm text-foreground">{new Date(provider.updated_at).toLocaleString('en-US', DATE_TIME_FORMAT_OPTIONS)}</span>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
