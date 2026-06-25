// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import * as React from 'react';
import {DropdownMenu, DropdownMenuTrigger, DropdownMenuContent} from '@/components/ui/dropdown-menu';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {ChevronDown, Check, Info} from 'lucide-react';
import {cn} from '@/lib/utils';

type Option = string | {label: string; value: string; disabled?: boolean; hint?: string};

export interface MultiSelectProps {
  value?: string[];
  options: Option[];
  placeholder?: string;
  emptyMessage?: string;
  onChange?: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  align?: 'start' | 'center' | 'end';
}

export function MultiSelect({
  value = [],
  options,
  placeholder = 'Select items...',
  emptyMessage = 'No items available',
  onChange,
  disabled = false,
  className,
  contentClassName,
  align = 'start'
}: MultiSelectProps) {
  const norm = React.useMemo(() => {
    return options.map((o) => (typeof o === 'string' ? {label: o, value: o, disabled: false, hint: undefined} : o));
  }, [options]);

  const displayText =
    value.length > 0
      ? norm
          .filter((o) => value.includes(o.value))
          .map((o) => o.label)
          .join(', ')
      : placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border-2 border-[#d5dff7] dark:border-border soft-card px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:border-[#0051af] dark:focus:border-ring focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50',
            !value.length && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn('min-w-[var(--radix-dropdown-menu-trigger-width)]', contentClassName)} align={align}>
        <TooltipProvider delayDuration={200}>
          {norm.length === 0 ? (
            <div className="py-2 px-2 text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            norm.map((option) => {
              const isSelected = value.includes(option.value);
              const isDisabled = option.disabled ?? false;
              return (
                <div
                  key={option.value}
                  className={cn(
                    'relative flex select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors',
                    isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-default hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isDisabled && !disabled && onChange) {
                      const newValue = isSelected ? value.filter((v) => v !== option.value) : [...value, option.value];
                      onChange(newValue);
                    }
                  }}
                >
                  <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                    {isSelected ? (
                      <div className="h-4 w-4 rounded border border-primary bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className={cn('h-4 w-4 rounded border soft-card', isDisabled ? 'border-input/50' : 'border-input')} />
                    )}
                  </span>
                  <span className="flex-1">{option.label}</span>
                  {isDisabled && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 leading-none">
                        Auto Attached
                      </span>
                      {option.hint && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-default"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Info className="w-3.5 h-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[280px] text-xs bg-popover">
                            {option.hint}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
