// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {Copy, Check} from 'lucide-react';
import {cn} from '@/lib/utils';
import {InlineId} from '@/components/ui/inline-id';

interface IdHoverCardProps {
  value: string;
  items: {label: string; value: string}[];
}

function IdRow({label, value, divider}: {label: string; value: string; divider: boolean}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div
      className={cn(
        'group/row flex items-center justify-between gap-6 px-4 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer',
        divider && 'border-b border-border'
      )}
      onClick={handleCopy}
    >
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
        <div className="text-xs font-mono text-foreground">{value.slice(0, 18)}...</div>
      </div>
      <div className="shrink-0 text-muted-foreground">
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5 opacity-0 group-hover/row:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
}

export function IdHoverCard({value, items}: IdHoverCardProps) {
  return (
    <div className="group relative inline-block">
      <InlineId value={value} />
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 top-full pt-1.5 z-10">
        <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[220px]">
          {items.map((item, i) => (
            <IdRow key={item.label} label={item.label} value={item.value} divider={i < items.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
