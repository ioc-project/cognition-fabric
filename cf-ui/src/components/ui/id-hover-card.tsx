// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {Copy, Check, Hash} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Popover, PopoverTrigger, PopoverContent} from '@/components/ui/popover';

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
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
        <div className="text-xs font-mono text-foreground break-all">{value}</div>
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
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Hash className="w-3 h-3 shrink-0" />
          <span className="font-mono">{value.slice(0, 8)}...</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        {items.map((item, i) => (
          <IdRow key={item.label} label={item.label} value={item.value} divider={i < items.length - 1} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
