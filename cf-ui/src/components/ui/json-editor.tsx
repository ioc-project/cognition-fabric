// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {forwardRef, useId, useImperativeHandle, useMemo, useRef, type AriaAttributes} from 'react';
import CodeMirror, {EditorView, type ReactCodeMirrorRef} from '@uiw/react-codemirror';
import {json} from '@codemirror/lang-json';
import {HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {useThemeStore} from '@/store/useThemeStore';
import {SyntaxJson} from './syntax-json';

const highlighting = HighlightStyle.define([
  {tag: tags.propertyName, color: 'var(--syntax-key)'},
  {tag: tags.string, color: 'var(--syntax-string)'},
  {tag: tags.number, color: 'var(--syntax-number)'},
  {tag: [tags.bool, tags.null], color: 'var(--syntax-keyword)'},
  {tag: tags.punctuation, color: 'var(--syntax-punctuation)'}
]);

interface JsonEditorProps {
  id?: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  initialHeight?: number;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
}

interface JsonEditorHandle {
  focus: () => void;
}

export const JsonEditor = forwardRef<JsonEditorHandle, JsonEditorProps>(function JsonEditor(
  {
    id,
    label,
    value,
    onChange,
    onBlur,
    disabled = false,
    readOnly = false,
    placeholder,
    initialHeight = 280,
    'aria-describedby': describedBy,
    'aria-invalid': invalid
  },
  ref
) {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({focus: () => (readOnly ? containerRef.current?.focus() : editorRef.current?.view?.focus())}), [readOnly]);
  const theme = useThemeStore((state) => state.theme);
  const extensions = useMemo(
    () => [
      json(),
      syntaxHighlighting(highlighting),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        id: editorId,
        'aria-label': label,
        'aria-multiline': 'true',
        'aria-disabled': String(disabled),
        'aria-invalid': String(invalid ?? false),
        ...(describedBy ? {'aria-describedby': describedBy} : {}),
        spellcheck: 'false'
      }),
      EditorView.theme(
        {
          '&': {height: '100%', fontSize: '13px', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))'},
          '.cm-scroller': {overflow: 'auto', fontFamily: 'var(--font-geist-mono, ui-monospace), monospace'},
          '.cm-gutters': {backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: 'none'},
          '.cm-activeLine, .cm-activeLineGutter': {backgroundColor: 'hsl(var(--muted) / 0.5)'},
          '&.cm-focused': {outline: 'none'},
          '.cm-cursor': {borderLeftColor: 'hsl(var(--foreground))'},
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {backgroundColor: 'hsl(var(--primary) / 0.2)'}
        },
        {dark: theme === 'dark'}
      )
    ],
    [editorId, label, disabled, invalid, describedBy, theme]
  );

  return (
    <div
      data-json-editor
      data-invalid={invalid === true || invalid === 'true' ? 'true' : undefined}
      ref={containerRef}
      role={readOnly ? 'region' : undefined}
      aria-label={readOnly ? label : undefined}
      tabIndex={readOnly ? 0 : undefined}
      className="w-full min-w-0 resize-y overflow-auto rounded-md border-2 border-border bg-card focus-within:border-ring data-[invalid=true]:border-destructive"
      style={{height: initialHeight, minHeight: 160}}
    >
      {readOnly ? (
        <SyntaxJson code={value} />
      ) : (
        <CodeMirror
          ref={editorRef}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          height="100%"
          style={{height: '100%'}}
          theme="none"
          extensions={extensions}
          editable={!disabled}
          readOnly={disabled}
          indentWithTab={false}
          placeholder={placeholder}
          basicSetup={{
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            autocompletion: false,
            closeBrackets: false,
            closeBracketsKeymap: false
          }}
        />
      )}
    </div>
  );
});
