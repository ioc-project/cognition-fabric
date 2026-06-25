// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {TrendingDown, TrendingUp, Zap} from 'lucide-react';
import {Card, CardContent, CardDescription, CardHeader} from '@/components/ui/card';
import {cn} from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  /** Percentage change vs previous period. null = no previous data. */
  trend?: number | null;
  /** E.g. "prev day", "prev week" — shown as a tooltip-style label */
  trendLabel?: string;
}

export function StatCard({label, value, trend, trendLabel}: StatCardProps) {
  const hasTrend = trend !== null && trend !== undefined;
  const isUp = hasTrend && trend! > 0;
  const isDown = hasTrend && trend! < 0;
  const isFlat = hasTrend && trend === 0;

  return (
    <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm bg-gradient-to-br from-background to-background/95">
      <CardHeader className="pb-2.5 pt-5 px-5">
        <CardDescription className="text-xs uppercase tracking-widest font-medium text-muted-foreground/70">{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className={cn('text-3xl font-semibold tracking-tight', isUp && 'text-emerald-600 dark:text-emerald-400')}>{value}</div>
        {hasTrend && (
          <div className="flex items-center gap-2 mt-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              )}
            >
              {isUp && <TrendingUp className="w-3.5 h-3.5" />}
              {isDown && <TrendingDown className="w-3.5 h-3.5" />}
              {isFlat && <Zap className="w-3.5 h-3.5 opacity-50" />}
              {isFlat ? 'Stable' : `${isUp ? '+' : ''}${trend!.toFixed(1)}%`}
            </span>
            {trendLabel && <span className="text-xs text-muted-foreground/60">{trendLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
