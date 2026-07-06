// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {CircuitBoard, Plus} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useMemo, useState} from 'react';
import {Button} from '@/components/ui/button';
import {SearchInput} from '@/components/ui/search-input';
import {ListShell} from '@/components/ui/list-shell';
import {ViewToggle} from '@/components/ui/view-toggle';
import {BasePage} from '@/components/ui/base-page';
import ConditionalSWRRenderer from '@/components/ui/conditional-swr-renderer';
import {CfnTableList} from './cfn-table-list';
import {CfnCardList} from './cfn-card-list';
import {CfnTopology} from './cfn-topology';
import {useCfnTopology} from '@/hooks/useCfnTopology';
import {routes} from '@/constants/routes';

type ViewMode = 'table' | 'card' | 'topology';

// NavBar is h-[52px]; main has p-8 (32px). Break out of padding with -m-8 and
// subtract navbar height so the topology fills the remaining viewport.
const TOPOLOGY_HEIGHT = 'calc(100vh - 52px)';

export function CfnList() {
  const router = useRouter();
  const {nodes: topologyNodes, isLoading: topoLoading, error: topoError} = useCfnTopology();
  const [viewMode, setViewMode] = useState<ViewMode>('topology');
  const [searchQuery, setSearchQuery] = useState('');

  const displayedTopologyNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return topologyNodes;
    }
    const q = searchQuery.toLowerCase();
    return topologyNodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [topologyNodes, searchQuery]);

  const viewToggleOptions: {value: ViewMode; label: string}[] = [
    {value: 'topology', label: 'Topology'},
    {value: 'table', label: 'Table'},
    {value: 'card', label: 'Card'}
  ];

  // Topology mode: break out of the BasePage/padding chrome and fill the viewport.
  // The topology component already has its own header bar with stats.
  if (viewMode === 'topology') {
    return (
      <div className="-m-8 flex flex-col" style={{height: TOPOLOGY_HEIGHT}}>
        {/* Slim controls bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border" style={{flexShrink: 0, background: 'hsl(var(--main-background))'}}>

          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">Cognition Fabric</span>
            <span className="text-xs text-muted-foreground">View and manage Cognition Fabric Nodes</span>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle options={viewToggleOptions} value={viewMode} onChange={setViewMode} />
            <Button asChild variant="sidebar" className="gap-2">
              <Link href={routes.cfn.create}>
                <Plus className="w-4 h-4" />
                Register CFN Node
              </Link>
            </Button>
          </div>
        </div>
        {/* Full-height topology canvas */}
        <div className="flex-1 min-h-0">
          {topoLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading topology…</div>
          ) : topoError ? (
            <div className="flex items-center justify-center h-full text-sm text-destructive">{topoError}</div>
          ) : (
            <CfnTopology nodes={topologyNodes} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <BasePage
        title="Cognition Fabric"
        description="View and manage Cognition Fabric Nodes"
        callToAction={
          topologyNodes.length > 0 ? (
            <div className="flex gap-2 items-center">
              <ViewToggle options={viewToggleOptions} value={viewMode} onChange={setViewMode} />
              <Button asChild variant="sidebar" className="gap-2">
                <Link href={routes.cfn.create}>
                  <Plus className="w-4 h-4" />
                  Register Cognition Fabric Node
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      >
        <ConditionalSWRRenderer
          data={topologyNodes}
          error={topoError}
          itemName="Cognition Fabric Nodes"
          customIsLoading={topoLoading}
          customEmptyComponent={
            <div className="flex items-center justify-center min-h-[50vh]">
              <ListShell
                empty={{
                  icon: CircuitBoard,
                  title: 'No Cognition Fabric Nodes exist.',
                  description: 'Register a Cognition Fabric Node to start managing your distributed memory plane.',
                  actionLabel: 'Register Node',
                  href: routes.cfn.create
                }}
              />
            </div>
          }
        >
          <div className="space-y-6">
            {viewMode === 'card' && <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search…" className="max-w-xs" />}
            {viewMode === 'table' ? (
              <CfnTableList
                nodes={topologyNodes}
                onRowClick={(node) => router.push(routes.cfn.details(node.id))}
                onOpenEdit={(node) => router.push(`${routes.cfn.details(node.id)}?edit=true`)}
              />
            ) : (
              <CfnCardList nodes={displayedTopologyNodes} onOpenEdit={(node) => router.push(`${routes.cfn.details(node.id)}?edit=true`)} />
            )}
          </div>
        </ConditionalSWRRenderer>
      </BasePage>
    </div>
  );
}
