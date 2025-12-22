'use client';

import * as React from 'react';
import {DropdownMenu, DropdownMenuTrigger, DropdownMenuContent} from '@/components/ui/dropdown-menu';
import {ChevronDown, Check} from 'lucide-react';
import {cn} from '@/lib/utils';

type Option = string | {label: string; value: string};

export interface MultiSelectProps {
  value?: string[];
  options: Option[];
  placeholder?: string;
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
  onChange,
  disabled = false,
  className,
  contentClassName,
  align = 'start'
}: MultiSelectProps) {
  const norm = React.useMemo(() => {
    return options.map((o) => (typeof o === 'string' ? {label: o, value: o} : o));
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
          aria-readonly={disabled}
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn('min-w-[200px]', contentClassName)} align={align}>
        {norm.map((option) => {
          const isSelected = value.includes(option.value);
          return (
            <div
              key={option.value}
              className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={(e) => {
                e.preventDefault();
                if (!disabled && onChange) {
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
                  <div className="h-4 w-4 rounded border border-input soft-card" />
                )}
              </span>
              {option.label}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
