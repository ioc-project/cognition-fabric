// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {Copy, Check} from 'lucide-react';
import {Input} from './input';
import {Button} from './button';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from './tooltip';

interface CopyableInputProps {
  value: string;
  className?: string;
}

export function CopyableInput({value, className = ''}: CopyableInputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Input value={value} disabled readOnly className={`pr-10 font-mono text-xs ${className}`} />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied ? 'Copied!' : 'Copy'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
