// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {cn} from '@/lib/utils';

export interface ViewToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ViewToggleProps<T extends string> {
  options: ViewToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function ViewToggle<T extends string>({options, value, onChange, className}: ViewToggleProps<T>) {
  return (
    <div className={cn('flex items-center gap-0.5 border rounded-md p-0.5 bg-muted/40 shrink-0', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => value !== opt.value && onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded transition-colors',
            value === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
