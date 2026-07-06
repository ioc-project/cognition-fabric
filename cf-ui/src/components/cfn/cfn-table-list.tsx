// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useMemo, useState} from 'react';
import {Edit, Eye, MoreVertical} from 'lucide-react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {SearchInput} from '@/components/ui/search-input';
import {cn} from '@/lib/utils';
import {routes} from '@/constants/routes';
import type {CognitionFabricNodeTopology} from '@/api/endpoints/cfn';

type StatusFilter = 'all' | 'online' | 'offline';

export interface CfnTableListProps {
  nodes: CognitionFabricNodeTopology[];
  onRowClick: (node: CognitionFabricNodeTopology) => void;
  onOpenEdit: (node: CognitionFabricNodeTopology) => void;
}

export function CfnTableList({nodes, onRowClick, onOpenEdit}: CfnTableListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    let items = nodes;
    if (statusFilter !== 'all') {
      items = items.filter((n) => n.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.ip_address?.toLowerCase().includes(q) ||
          n.cognition_engines?.some((ce) => ce.name.toLowerCase().includes(q))
      );
    }
    return items;
  }, [nodes, statusFilter, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search…" className="max-w-xs" />
        <div className="flex items-center gap-1">
          {(['all', 'online', 'offline'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md border transition-colors capitalize',
                statusFilter === f
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">IP / Port</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Engines</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Memory</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Seen</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((node) => {
              const online = node.status === 'online';
              const engines = node.cognition_engines ?? [];
              const memProviders = node.memory_providers ?? [];
              const onlineEngines = engines.filter((e) => e.status === 'online').length;
              const offlineEngines = engines.length - onlineEngines;
              const lastSeen = node.last_seen
                ? new Date(node.last_seen).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })
                : null;

              return (
                <tr key={node.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => onRowClick(node)}>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-foreground">{node.name}</div>
                  </td>
                  <td className="px-3 py-3">
                    {node.ip_address ? (
                      <span className="text-xs text-muted-foreground font-mono">
                        {node.ip_address}{node.port ? `:${node.port}` : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-medium',
                        online ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', online ? 'bg-green-500' : 'bg-muted-foreground/50')} />
                      {online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {engines.length > 0 ? (
                      <span className="text-xs text-foreground">
                        <span className="text-green-500">●</span> {onlineEngines}
                        <span className="mx-1 text-muted-foreground">/</span>
                        <span className="text-muted-foreground/60">○</span> {offlineEngines}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {memProviders.length > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        {memProviders.length} shared
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn('px-3 py-3 text-xs', online ? 'text-muted-foreground' : 'text-red-500 dark:text-red-400')}>
                    {lastSeen ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={routes.cfn.details(node.id)} onClick={(e) => e.stopPropagation()}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEdit(node);
                          }}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No nodes match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
