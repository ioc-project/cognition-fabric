// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {type ElementType} from 'react';
import {cn} from '@/lib/utils';

interface ActionButtonProps {
  icon?: ElementType;
  label?: string;
  variant?: 'default' | 'primary' | 'destructive';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ActionButton({icon: Icon, label, variant = 'default', onClick, disabled, className}: ActionButtonProps) {
  const iconOnly = Icon && !label;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 text-sm border rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50',
        iconOnly ? 'p-1.5' : 'px-3 py-1.5',
        variant === 'primary' && 'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
        variant === 'destructive' && 'border-border text-muted-foreground hover:text-red-600 hover:bg-red-500/10 hover:border-red-400/50',
        variant === 'default' && 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60',
        className
      )}
    >
      {Icon && <Icon size={14} />}
      {label && <span>{label}</span>}
    </button>
  );
}
