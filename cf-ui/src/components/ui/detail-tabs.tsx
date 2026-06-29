// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {cn} from '@/lib/utils';

export interface DetailTab {
  id: string;
  label: string;
  count?: number;
}

interface DetailTabsProps {
  tabs: DetailTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function DetailTabs({tabs, activeTab, onTabChange, className}: DetailTabsProps) {
  return (
    <div className={cn('flex items-center border-b border-border', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-medium transition-colors',
              isActive
                ? 'text-foreground shadow-[inset_0_-2px_0_hsl(var(--indicator-active))]'
                : 'text-muted-foreground hover:text-foreground/70'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none',
                  isActive
                    ? 'bg-[hsl(var(--indicator-active))] text-white'
                    : 'bg-muted text-foreground border border-border'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
