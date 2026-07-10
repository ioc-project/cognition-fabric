// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';

interface KindsSubkindsDisplayProps {
  kindsSubkinds: Record<string, string[]> | null | undefined;
  emptyDisplay?: React.ReactNode;
}

const MAX_VISIBLE = 3;

export function KindsSubkindsDisplay({kindsSubkinds, emptyDisplay}: KindsSubkindsDisplayProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!kindsSubkinds || Object.keys(kindsSubkinds).length === 0) {
    return <>{emptyDisplay ?? <span className="text-muted-foreground">-</span>}</>;
  }

  return (
    <div className="space-y-1">
      {Object.entries(kindsSubkinds).map(([kind, subkinds]) => {
        const isExpanded = expanded[kind] ?? false;
        const hiddenCount = subkinds.length - MAX_VISIBLE;
        const visible = isExpanded ? subkinds : subkinds.slice(0, MAX_VISIBLE);

        return (
          <div key={kind} className="flex items-center gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 shrink-0">{kind}:</span>
            <div className="flex flex-wrap items-center gap-1">
              {visible.map((sk) => (
                <span
                  key={sk}
                  className="inline-flex items-center font-mono text-xs bg-muted border border-border px-1.5 py-0.5 rounded text-foreground"
                >
                  {sk}
                </span>
              ))}
              {!isExpanded && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({...prev, [kind]: true}))}
                  className="text-xs text-blue-500 underline ml-1"
                >
                  +{hiddenCount} more
                </button>
              )}
              {isExpanded && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({...prev, [kind]: false}))}
                  className="text-xs text-blue-500 underline ml-1"
                >
                  show less
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
