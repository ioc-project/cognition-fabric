// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {Copy, Check} from 'lucide-react';

interface InlineIdProps {
  label?: string;
  value: string;
}

export function InlineId({label, value}: InlineIdProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const display = `${value.slice(0, 8)}...`;
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={value}
      className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {label && <span className="font-medium">{label}</span>}
      <span className="font-mono">{display}</span>
      {copied ? (
        <Check className="w-3 h-3 text-green-500 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}
