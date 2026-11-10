// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useId} from 'react';
import {Copy} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {JsonEditor} from '@/components/ui/json-editor';
import {CollapsibleJsonField} from './collapsible-json-field';

export function MASInputMode({mode, onChange, disabled}: {mode: 'form' | 'json'; onChange: (mode: 'form' | 'json') => void; disabled?: boolean}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Form</span>
      <Switch
        id={id}
        aria-label="Edit full JSON request"
        checked={mode === 'json'}
        onCheckedChange={(json) => onChange(json ? 'json' : 'form')}
        disabled={disabled}
      />
      <label htmlFor={id} className="cursor-pointer">
        JSON
      </label>
    </div>
  );
}

export function MASJsonEditor({value, onChange, disabled}: {value: string; onChange: (value: string) => void; disabled?: boolean}) {
  const id = useId();
  return (
    <div className="w-full space-y-2">
      <span className="text-sm font-medium">Full MAS request</span>
      <p className="text-sm text-muted-foreground">
        Paste the request body accepted by the Management API. This page supplies the API URL and workspace; omit generated IDs.
      </p>
      <JsonEditor id={id} label="Full MAS request JSON" value={value} onChange={onChange} disabled={disabled} initialHeight={480} />
    </div>
  );
}

export function TopologyJSON({
  value,
  onChange,
  readOnly = false,
  showEditor = true,
  disabled = false,
  error,
  sourceLabel = 'Provided'
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  showEditor?: boolean;
  disabled?: boolean;
  error?: string | null;
  sourceLabel?: string;
}) {
  const id = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Topology JSON copied');
    } catch {
      toast.error('Could not copy topology JSON');
    }
  };
  return (
    <div className="w-full space-y-3 rounded border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        {showEditor ? (
          <span className="text-sm font-medium">Topology JSON</span>
        ) : (
          <h3 className="text-sm font-medium">{sourceLabel} topology JSON</h3>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} disabled={!value}>
          <Copy size={13} /> Copy
        </Button>
      </div>
      {showEditor ? (
        <>
          <p className="text-sm text-muted-foreground">
            Optional provided topology, including optional start/end markers. Save to store changes in CF. Clear this box to remove the provided
            topology.
          </p>
          <JsonEditor
            id={id}
            label="Topology JSON"
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            disabled={disabled}
            placeholder={'[\n  {"source": "provided", "completeness": "partial", "nodes": [], "edges": []}\n]'}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          {error && (
            <p id={`${id}-error`} className="whitespace-pre-wrap text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      ) : (
        <CollapsibleJsonField label="Topology JSON" value={value} isEditMode={false} />
      )}
    </div>
  );
}

export function MASRequestError({message, inspectHref, writeFailed = false}: {message: string | null; inspectHref: string; writeFailed?: boolean}) {
  if (!message) {
    return null;
  }
  return (
    <div
      role="alert"
      className="w-full space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
    >
      <p className="whitespace-pre-wrap break-words">{message}</p>
      {writeFailed && (
        <p>
          A save may have committed before a connection or refresh failed.{' '}
          <a className="underline" href={inspectHref} target="_blank" rel="noreferrer">
            Inspect the saved MAS data
          </a>{' '}
          before retrying. Your draft remains here.
        </p>
      )}
    </div>
  );
}
