// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {cn} from '@/lib/utils';

interface StatusDotProps {
  variant: 'health' | 'state';
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  className?: string;
}

export function StatusDot({variant, active, activeLabel, inactiveLabel, className}: StatusDotProps) {
  const label = active ? (activeLabel ?? (variant === 'health' ? 'Online' : 'Enabled')) : (inactiveLabel ?? (variant === 'health' ? 'Offline' : 'Disabled'));

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {variant === 'health' && active ? (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
      ) : (
        <span
          className={cn(
            'inline-flex h-2 w-2 shrink-0 rounded-full',
            variant === 'health' ? 'bg-gray-400 dark:bg-gray-500' : active ? 'bg-[hsl(var(--indicator-active))]' : 'bg-gray-400 dark:bg-gray-500'
          )}
        />
      )}
      <span className="text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}
