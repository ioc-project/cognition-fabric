// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

interface SyntaxJsonProps {
  code: string;
}

export function SyntaxJson({code}: SyntaxJsonProps) {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const SUCCESS_VALS = /^"(SUCCESS|COMPLETED|ACTIVE|ONLINE|ENABLED|HEALTHY)"$/;
  const ERROR_VALS = /^"(FAILED|ERROR|OFFLINE|BLOCKED|DISABLED|UNHEALTHY)"$/;

  const highlighted = escaped
    .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span style="color:var(--syntax-key)">$1</span>:')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, (_, val) => {
      if (SUCCESS_VALS.test(val)) {
        return `: <span style="color:var(--syntax-string)">${val}</span>`;
      }
      if (ERROR_VALS.test(val)) {
        return `: <span style="color:var(--syntax-error)">${val}</span>`;
      }
      return `: <span style="color:var(--syntax-string)">${val}</span>`;
    })
    .replace(/:\s*(\d+(?:\.\d+)?)/g, ': <span style="color:var(--syntax-number)">$1</span>')
    .replace(/:\s*(true|false|null)\b/g, ': <span style="color:var(--syntax-keyword)">$1</span>');

  // Color structural chars only in text nodes (not inside existing spans)
  const withPunctuation = highlighted
    .split(/(<[^>]+>)/)
    .map((part, i) => (i % 2 === 0 ? part.replace(/[{}\[\],]/g, '<span style="color:var(--syntax-punctuation)">$&</span>') : part))
    .join('');

  return (
    <pre
      className="text-xs leading-relaxed text-muted-foreground p-4 font-mono whitespace-pre-wrap break-words"
      dangerouslySetInnerHTML={{__html: withPunctuation}}
    />
  );
}
