// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {type ReactNode} from 'react';
import {cn} from '@/lib/utils';

export function InfoPanel({children, className}: {children: ReactNode; className?: string}) {
  return <div className={cn('rounded-lg border border-border overflow-hidden bg-card shadow-sm', className)}>{children}</div>;
}

export function InfoRow({label, children, className}: {label: ReactNode; children: ReactNode; className?: string}) {
  return (
    <div className={cn('flex items-center px-5 py-3.5 border-b border-border last:border-b-0', className)}>
      <div className="w-40 text-xs text-[#9ca3af] font-medium shrink-0">{label}</div>
      {children}
    </div>
  );
}
