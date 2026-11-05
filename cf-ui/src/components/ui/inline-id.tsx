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
  alwaysShowCopyIcon?: boolean;
  copiedIconClassName?: string;
  className?: string;
}

export function InlineId({label, value, alwaysShowCopyIcon = false, copiedIconClassName, className}: InlineIdProps) {
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
  const display = `${value.slice(0, 8)}...`;
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={value}
      aria-label={copied ? `${label || 'ID'} copied` : `Copy ${label || 'ID'}`}
      className={cn('group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors', className)}
    >
      {label && <span className="font-medium">{label}</span>}
      <span className="min-w-0 truncate font-mono">{display}</span>
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
