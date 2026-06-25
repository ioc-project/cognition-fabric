// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {cn} from '@/lib/utils';

interface ReadOnlyFieldProps {
  value: string;
  className?: string;
  multiline?: boolean;
}

export function ReadOnlyField({value, className, multiline = false}: ReadOnlyFieldProps) {
  if (multiline) {
    return (
      <div
        className={cn(
          'w-full rounded-md border-2 border-[#d5dff7] dark:border-border soft-card px-3 py-2 text-sm text-foreground min-h-[80px] whitespace-pre-wrap',
          className
        )}
      >
        {value}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-10 w-full items-center rounded-md border-2 border-[#d5dff7] dark:border-border soft-card px-3 py-2 text-sm text-foreground',
        className
      )}
    >
      {value}
    </div>
  );
}
