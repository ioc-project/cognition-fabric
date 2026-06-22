import * as React from 'react';

import {cn} from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({className, type, ...props}, ref) => {
  return (
    <input
      type={type ?? 'text'}
      className={cn(
        'flex h-10 w-full rounded-md border-2 border-[hsl(var(--input-border-light))] dark:border-border soft-card px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[hsl(var(--input-border-focus))] dark:focus-visible:border-ring focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-destructive data-[invalid=true]:focus-visible:border-destructive data-[invalid=true]:ring-1 data-[invalid=true]:ring-destructive data-[invalid=true]:ring-offset-0',
        className
      )}
      ref={ref}
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
      {...props}
    />
  );
});
Input.displayName = 'Input';

export {Input};
