// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useEffect, useRef, useState} from 'react';
import {Copy, Check} from 'lucide-react';
import {toast} from 'sonner';
import {cn} from '@/lib/utils';

interface InlineIdProps {
  label?: string;
  value: string;
  truncate?: boolean;
  alwaysShowCopyIcon?: boolean;
  copiedIconClassName?: string;
  className?: string;
}

export function InlineId({label, value, truncate = true, alwaysShowCopyIcon = false, copiedIconClassName, className}: InlineIdProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    },
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      toast.error('Could not copy ID');
    }
  };
  const display = truncate ? `${value.slice(0, 8)}...` : value;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void handleCopy();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
        }
      }}
      title={value}
      aria-label={copied ? `${label || 'ID'} copied` : `Copy ${label || 'ID'}`}
      className={cn('group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors', className)}
    >
      {label && <span className="font-medium shrink-0">{label}</span>}
      <span className={cn('min-w-0 font-mono', truncate ? 'truncate' : 'break-all text-left')}>{display}</span>
      {copied ? (
        <Check className={cn('w-3 h-3 text-green-500 shrink-0', copiedIconClassName)} aria-hidden="true" />
      ) : (
        <Copy
          className={cn(
            'w-3 h-3 shrink-0 transition-opacity',
            alwaysShowCopyIcon ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          )}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
