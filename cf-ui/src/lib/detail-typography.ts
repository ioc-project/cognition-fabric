/**
 * Shared typography constants for detail/info pages.
 *
 * Usage:
 *   import { dtLabel, dtValue, dtSectionHeader, dtRow, dtField } from '@/lib/detail-typography';
 */

/** Field label */
export const dtLabel = 'text-xs font-medium text-muted-foreground';

/** Standard body value — for field values in detail rows */
export const dtValue = 'text-sm text-foreground';

/** Card/panel section header title */
export const dtSectionHeader = 'text-sm font-medium text-foreground';

/** Two-column detail row (label column + value column) */
export const dtRow = 'grid grid-cols-[180px_1fr] items-start gap-3 py-2.5 border-b border-border last:border-0';

/** Stacked label+value pair (used in sidebar detail panels) */
export const dtField = 'flex flex-col gap-1';
