// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {ArrowLeft, Network, Search, Code, Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';

interface GraphHeaderProps {
  stats: {nodes: number; edges: number} | null;
  showRaw: boolean;
  onToggleRaw: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchEnter: () => void;
  onExport: () => void;
  onBack: () => void;
}

export function GraphHeader({stats, showRaw, onToggleRaw, searchQuery, onSearchChange, onSearchEnter, onExport, onBack}: GraphHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b bg-background flex-shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-base font-semibold">Knowledge Graph</h1>
        </div>
        {stats && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {stats.nodes} nodes
            </Badge>
            <Badge variant="outline" className="text-xs">
              {stats.edges} edges
            </Badge>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {!showRaw && (
          <div className="flex items-center gap-1.5 h-8 w-52 rounded-md border-2 border-[#d5dff7] dark:border-border px-2.5 bg-background focus-within:border-[#0051af] dark:focus-within:border-ring transition-colors">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              placeholder="Search by name or type..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSearchEnter();
                }
              }}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground min-w-0"
            />
          </div>
        )}
        {!showRaw && (
          <Button variant="outline" size="sm" className="gap-2" onClick={onExport}>
            <Download className="w-4 h-4" />
            Export
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-2" onClick={onToggleRaw}>
          <Code className="w-4 h-4" />
          {showRaw ? 'Hide Raw' : 'Raw Data'}
        </Button>
      </div>
    </div>
  );
}
