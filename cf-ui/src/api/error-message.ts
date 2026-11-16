// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

export function apiErrorMessage(body: unknown, fallback = 'Request failed'): string {
  if (typeof body === 'string') {
    return body;
  }
  if (!body || typeof body !== 'object') {
    return fallback;
  }
  const response = body as Record<string, unknown>;
  const detail = response.detail ?? response.message ?? response.error;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail)) {
    return (
      detail
        .map((entry: unknown) => {
          if (!entry || typeof entry !== 'object') {
            return typeof entry === 'string' ? entry : JSON.stringify(entry);
          }
          const issue = entry as Record<string, unknown>;
          const path = Array.isArray(issue.loc) ? issue.loc : [];
          const location = (path[0] === 'body' ? path.slice(1) : path).join('.');
          return `${location || 'Request'}: ${typeof issue.msg === 'string' ? issue.msg : JSON.stringify(entry)}`;
        })
        .join('\n') || fallback
    );
  }
  if (detail && typeof detail === 'object') {
    const structured = detail as Record<string, unknown>;
    const {references: _references, ...description} = structured;
    const message =
      [structured.message, structured.error, structured.reason].find((value) => typeof value === 'string' && value.trim()) ??
      (Object.keys(description).length ? JSON.stringify(description) : fallback);
    const references = Array.isArray(structured.references) ? structured.references : structured.references ? [structured.references] : [];
    return [message, ...references.map((reference) => (typeof reference === 'string' ? reference : JSON.stringify(reference)))].join('\n');
  }
  return fallback;
}
