// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

interface SyntaxJsonProps {
  code: string;
}

export function SyntaxJson({code}: SyntaxJsonProps) {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const highlighted = escaped
    .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span style="color:#1d6ffa">$1</span>:')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span style="color:#0ea5e9">$1</span>')
    .replace(/:\s*(\d+)/g, ': <span style="color:#ea580c">$1</span>');
  return (
    <pre
      className="text-xs leading-relaxed text-[#6b7280] p-4 font-mono"
      dangerouslySetInnerHTML={{__html: highlighted}}
    />
  );
}
