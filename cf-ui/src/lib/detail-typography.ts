// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared typography constants for detail/info pages.
 *
 * Usage:
 *   import { dtLabel, dtValue, dtSectionHeader, dtRow, dtField } from '@/lib/detail-typography';
 */

/** Field label */
export const dtLabel = 'text-sm text-muted-foreground';

/** Compact field label (legacy detail-label visual style) */
export const dtCompactLabel = 'detail-label';

/** Standard body value — for field values in detail rows */
export const dtValue = 'text-sm text-foreground';

/** Card/panel section header title */
export const dtSectionHeader = 'text-sm font-medium text-foreground';

/** Two-column detail row (label column + value column) */
export const dtRow = 'grid grid-cols-[180px_1fr] items-start gap-3 py-2.5 border-b border-border last:border-0';

/** Stacked label+value pair (used in sidebar detail panels) */
export const dtField = 'flex flex-col gap-1';

/** Compact metadata label (created/updated timestamps) */
export const dtMetaLabel = 'text-xs text-muted-foreground';

/** Compact metadata value (created/updated timestamps) */
export const dtMetaValue = 'text-xs text-foreground';

/** Detail panel/card header row surface */
export const dtPanelHeader = 'px-4 py-3 border-b border-border flex items-center justify-between bg-[hsl(var(--border)/0.5)]';

/** Interactive detail panel/card header row surface */
export const dtPanelHeaderInteractive = `${dtPanelHeader} cursor-pointer hover:brightness-95`;
