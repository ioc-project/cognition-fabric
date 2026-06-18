'use client';

import {ChevronDown, ChevronUp} from 'lucide-react';
import {FormControl, FormItem, FormLabel, FormMessage} from '@/components/ui/form';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {validateJSON, formatJson} from '@/lib/utils';

interface CollapsibleJsonFieldProps {
  label: string;
  value: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  isEditMode: boolean;
  field?: any;
}

export function CollapsibleJsonField({
  label,
  value,
  isExpanded,
  onToggleExpand,
  onChange: _onChange,
  placeholder,
  isEditMode,
  field
}: CollapsibleJsonFieldProps) {
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
      <div className="space-y-2">
        <Label>{label}</Label>
        <pre className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">
          {formatted || '{\n  "key": "value"\n}'}
        </pre>
      </div>
    );
  }

  return (
    <FormItem>
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center gap-2">
          <FormLabel>{label}</FormLabel>
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
