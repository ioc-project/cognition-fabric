'use client';

import {useState} from 'react';
import {Copy, Check} from 'lucide-react';
import {Button} from './button';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from './tooltip';

interface CopyableIdProps {
  id: string;
  label?: string;
  className?: string;
}

export function CopyableId({id, label, className = ''}: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm font-medium text-muted-foreground">{label}:</span>}
      <div className="flex-1 flex items-center gap-2 bg-muted/30 rounded-lg border border-border px-3 py-2">
        <code className="flex-1 text-xs font-mono text-foreground select-all break-all">{id}</code>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="sm" onClick={handleCopy} className="h-6 w-6 p-0 hover:bg-muted flex-shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{copied ? 'Copied!' : 'Copy ID'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
