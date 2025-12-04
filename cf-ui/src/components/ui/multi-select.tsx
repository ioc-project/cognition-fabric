'use client';

import * as React from 'react';
import {DropdownMenu, DropdownMenuTrigger, DropdownMenuContent} from '@/components/ui/dropdown-menu';
import {ChevronDown, Check} from 'lucide-react';
import {cn} from '@/lib/utils';

export interface MultiSelectProps {
  value?: string[];
  options: string[];
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
  const displayText = value.length > 0 ? value.join(', ') : placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input soft-card px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
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
        {options.map((option) => {
          const isSelected = value.includes(option);
          return (
            <div
              key={option}
              className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={(e) => {
                e.preventDefault();
                if (!disabled && onChange) {
                  const newValue = isSelected ? value.filter((v) => v !== option) : [...value, option];
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
              {option}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
