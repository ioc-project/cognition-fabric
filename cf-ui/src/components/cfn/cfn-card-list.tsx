// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Zap, Database, ArrowRight, MoreVertical, Eye, Edit} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {routes} from '@/constants/routes';
import type {CognitionFabricNodeTopology} from '@/api/endpoints/cfn';

export interface CfnCardListProps {
  nodes: CognitionFabricNodeTopology[];
  onOpenEdit?: (node: CognitionFabricNodeTopology) => void;
}

export function CfnCardList({nodes, onOpenEdit}: CfnCardListProps) {
  return (
    <div className="list-grid">
      {nodes.map((node) => (
        <CfnCard key={node.id} node={node} onOpenEdit={onOpenEdit} />
      ))}
    </div>
  );
}

function CfnCard({node, onOpenEdit}: {node: CognitionFabricNodeTopology; onOpenEdit?: (node: CognitionFabricNodeTopology) => void}) {
  const router = useRouter();
  const online = node.status === 'online';
  const engines = node.cognition_engines ?? [];
  const memProviders = node.memory_providers ?? [];
  const lastSeen = node.last_seen
    ? new Date(node.last_seen).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false})
    : null;

  return (
    <Card
      variant="list"
      className="flex flex-col cursor-pointer"
      style={{borderTop: `2px solid ${online ? '#22c55e' : 'hsl(var(--border))'}`}}
      onClick={() => router.push(routes.cfn.details(node.id))}
    >
      <div className="pb-4 mb-4 border-b border-border/50 flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{node.name}</div>
          {node.ip_address && (
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              {node.ip_address} · {node.port ?? '—'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium border ${online ? 'text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-900 dark:bg-green-950' : 'text-muted-foreground border-border bg-muted'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
          <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border border-border bg-muted text-muted-foreground">
            {node.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={routes.cfn.details(node.id)}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </Link>
              </DropdownMenuItem>
              {onOpenEdit && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenEdit(node);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cognition Engines ({engines.length})</span>
          </div>
          {engines.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">None</p>
          ) : (
            <ul className="space-y-1">
              {engines.slice(0, 4).map((ce) => (
                <li key={ce.id} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ce.status === 'online' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                  <span className="text-xs text-foreground truncate">{ce.name}</span>
                </li>
              ))}
              {engines.length > 4 && <li className="text-xs text-muted-foreground pl-3">+{engines.length - 4} more</li>}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Database className="w-3 h-3 text-purple-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memory ({memProviders.length})</span>
          </div>
          {memProviders.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">None</p>
          ) : (
            <ul className="space-y-1">
              {memProviders.slice(0, 3).map((mp) => (
                <li key={mp.id} className="text-xs text-foreground truncate">
                  · {mp.name}
                </li>
              ))}
              {memProviders.length > 3 && <li className="text-xs text-muted-foreground">+{memProviders.length - 3} more</li>}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 mt-4 border-t border-border/50">
        {lastSeen ? (
          <span className={`text-xs ${online ? 'text-muted-foreground' : 'text-red-500 dark:text-red-400'}`}>Last seen {lastSeen}</span>
        ) : (
          <span />
        )}
        <Link
          href={routes.cfn.details(node.id)}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={`View details for ${node.name}`}
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Card>
  );
}
