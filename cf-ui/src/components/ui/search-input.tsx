'use client';

import {Search} from 'lucide-react';
import {cn} from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({value, onChange, placeholder = 'Search…', className}: SearchInputProps) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{paddingLeft: '2.75rem', backgroundColor: 'hsl(var(--main-background))', borderColor: 'hsl(var(--navbar-border))'}}
        className="h-10 w-full rounded-md border-2 py-2 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
      />
    </div>
  );
}
