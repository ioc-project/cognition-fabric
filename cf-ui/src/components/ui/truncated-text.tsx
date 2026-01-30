'use client';

import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {cn} from '@/lib/utils';

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
  showTooltip?: boolean;
}

export function TruncatedText({text, maxLength = 40, className, showTooltip = true}: TruncatedTextProps) {
  const shouldTruncate = text.length > maxLength;
  const truncatedText = shouldTruncate ? `${text.slice(0, maxLength)}...` : text;

  if (!shouldTruncate || !showTooltip) {
    return <span className={className}>{text}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn('cursor-pointer', className)}>{truncatedText}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-md break-words !bg-[hsl(var(--sidebar-hover))] border-border">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
