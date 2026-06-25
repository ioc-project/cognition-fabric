// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import * as React from 'react';

import {cn} from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({className, ...props}, ref) => {
  return (
    <textarea
      className={cn(
        'flex !h-auto min-h-[80px] w-full rounded-md border-2 border-[hsl(var(--input-border-light))] dark:border-border px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[hsl(var(--input-border-focus))] dark:focus-visible:border-ring focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-destructive data-[invalid=true]:focus-visible:border-destructive data-[invalid=true]:ring-1 data-[invalid=true]:ring-destructive data-[invalid=true]:ring-offset-0',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export {Textarea};
