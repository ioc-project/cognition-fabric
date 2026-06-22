import React from 'react';
import {TrendingDown, TrendingUp, Zap} from 'lucide-react';
import {cn} from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  /** Optional icon displayed to the left of the content */
  icon?: React.ReactNode;
  /** Secondary line shown below the value */
  sublabel?: string;
  /** Percentage change vs previous period. null = no previous data. */
  trend?: number | null;
  /** E.g. "prev day", "prev week" — shown as a tooltip-style label */
  trendLabel?: string;
  className?: string;
}

export function StatCard({label, value, icon, sublabel, trend, trendLabel, className}: StatCardProps) {
  const hasTrend = trend !== null && trend !== undefined;
  const isUp = hasTrend && trend! > 0;
  const isDown = hasTrend && trend! < 0;
  const isFlat = hasTrend && trend === 0;

  return (
    <div className={cn('bg-card border border-border rounded-lg py-10 px-5 flex items-start gap-3', className)}>
      {icon && <div className="mt-0.5 p-2 rounded bg-[hsl(var(--sidebar-icon-active)/0.1)] shrink-0">{icon}</div>}
      <div className="flex flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={cn('text-lg font-bold text-foreground mt-1', isUp && 'text-emerald-600 dark:text-emerald-400')}>{value}</div>
        {sublabel && <span className="text-sm text-muted-foreground mt-0.5">{sublabel}</span>}
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
      </div>
    </div>
  );
}
