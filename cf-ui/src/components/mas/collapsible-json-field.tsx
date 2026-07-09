// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import React, {useState} from 'react';
import {ChevronDown, ChevronUp} from 'lucide-react';
import {FormControl, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Textarea} from '@/components/ui/textarea';
import {validateJSON, formatJson, cn} from '@/lib/utils';
import {SyntaxJson} from '@/components/ui/syntax-json';
import {dtPanelHeaderInteractive, dtSectionHeader} from '@/lib/detail-typography';

interface CollapsibleJsonFieldProps {
  label: string;
  labelSuffix?: React.ReactNode;
  value: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  defaultExpanded?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
  isEditMode: boolean;
  field?: any;
}

export function CollapsibleJsonField({
  label,
  labelSuffix,
  value,
  isExpanded: controlledExpanded,
  onToggleExpand,
  defaultExpanded = true,
  onChange: _onChange,
  placeholder,
  isEditMode,
  field
}: CollapsibleJsonFieldProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded! : internalExpanded;
  const handleToggle = isControlled ? onToggleExpand! : () => setInternalExpanded((v) => !v);

  if (!isEditMode) {
    let formatted = value;
    if (value && value.trim() !== '') {
      try {
        formatted = JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        // leave as-is if not valid JSON
      }
    }

    return (
      <div className="rounded-lg border border-border bg-card shadow-sm">
        <button type="button" className={cn('w-full rounded-lg', dtPanelHeaderInteractive)} onClick={handleToggle}>
          <span className="flex items-center gap-1.5">
            <span className={dtSectionHeader}>{label}</span>
            {labelSuffix}
          </span>
          <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', !isExpanded && '-rotate-90')} />
        </button>
        {isExpanded && (
          <div className="border-t border-border bg-muted rounded-b-lg">
            <SyntaxJson code={formatted || '{\n  "key": "value"\n}'} />
          </div>
        )}
      </div>
    );
  }

  return (
    <FormItem>
      <div className="flex items-center justify-between cursor-pointer" onClick={handleToggle}>
        <div className="flex items-center gap-2">
          <FormLabel>{label}</FormLabel>
          {labelSuffix}
          {field?.value && field.value.trim() !== '' && (
            <span className={`text-xs px-2 py-0.5 rounded ${validateJSON(field.value) ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
              {validateJSON(field.value) ? 'Valid JSON' : 'Invalid JSON'}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </div>
      {isExpanded && (
        <FormControl>
          <Textarea
            placeholder={placeholder}
            className="font-mono text-sm min-h-[150px] resize-y"
            {...field}
            onBlur={() => field?.onChange(formatJson(field.value || ''))}
          />
        </FormControl>
      )}
      <FormMessage />
    </FormItem>
  );
}
