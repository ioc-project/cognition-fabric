// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {type ReactNode} from 'react';
import {cn} from '@/lib/utils';

interface MetaCardProps {
  label: string;
  children: ReactNode;
  mono?: boolean;
  className?: string;
}

export function MetaCard({label, children, mono = false, className}: MetaCardProps) {
  return (
    <div className={cn('rounded-lg border border-border px-5 py-3.5 bg-card shadow-sm', className)}>
      <div className="text-[10.5px] text-[#9ca3af] font-semibold uppercase tracking-wider mb-1">{label}</div>
      <div className={cn('text-sm text-foreground', mono && 'font-mono')}>{children}</div>
    </div>
  );
}
