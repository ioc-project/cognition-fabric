// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';

export type KindsSubkindsVariant = 'A' | 'C' | 'D';

interface KindsSubkindsDisplayProps {
  kindsSubkinds: Record<string, string[]> | null | undefined;
  emptyDisplay?: React.ReactNode;
  variant?: KindsSubkindsVariant;
  compact?: boolean;
}

const MAX_VISIBLE = 3;

export function KindsSubkindsDisplay({kindsSubkinds, emptyDisplay, variant = 'D', compact = false}: KindsSubkindsDisplayProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!kindsSubkinds || Object.keys(kindsSubkinds).length === 0) {
    return <>{emptyDisplay ?? <span className="text-muted-foreground">-</span>}</>;
  }

  const isC = variant === 'C';
  const isD = variant === 'D';

  const rows = Object.entries(kindsSubkinds).map(([kind, subkinds]) => {
    const isExpanded = expanded[kind] ?? false;
    const hiddenCount = subkinds.length - MAX_VISIBLE;
    const visible = isExpanded ? subkinds : subkinds.slice(0, MAX_VISIBLE);

    return (
      <div
        key={kind}
        className={
          isC ? 'flex items-center px-3 py-2 border-b border-border last:border-b-0 gap-3' : `flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`
        }
      >
        {variant === 'A' && <span className="text-sm font-normal text-foreground w-20 shrink-0 capitalize">{kind}</span>}
        {variant === 'C' && <span className="text-xs font-medium text-foreground w-24 shrink-0 capitalize">{kind}</span>}
        {variant === 'D' && (
          <>
            <span className="inline-flex items-center text-xs font-medium text-foreground capitalize border border-border rounded-full px-2.5 py-0.5 shrink-0">
              {kind}
            </span>
            <span className="text-muted-foreground text-xs shrink-0">›</span>
          </>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {visible.map((sk) => (
            <span
              key={sk}
              className={`inline-flex items-center font-mono text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 ${isD ? 'px-2' : 'px-1.5'} py-0.5 rounded text-foreground`}
            >
              {sk}
            </span>
          ))}
          {!isExpanded && hiddenCount > 0 && (
            <button type="button" onClick={() => setExpanded((prev) => ({...prev, [kind]: true}))} className="text-xs text-blue-500 underline ml-1">
              +{hiddenCount} more
            </button>
          )}
          {isExpanded && hiddenCount > 0 && (
            <button type="button" onClick={() => setExpanded((prev) => ({...prev, [kind]: false}))} className="text-xs text-blue-500 underline ml-1">
              show less
            </button>
          )}
        </div>
      </div>
    );
  });

  if (isC) {
    return <div className="rounded-md border border-border overflow-hidden">{rows}</div>;
  }

  return <div className={compact ? 'space-y-1' : 'space-y-2'}>{rows}</div>;
}
