'use client';

import * as React from 'react';
import {ResponsiveContainer, Tooltip} from 'recharts';
import type {NameType, Payload, ValueType, Formatter} from 'recharts/types/component/DefaultTooltipContent';
import {cn} from '@/lib/utils';

// ─── Config types ────────────────────────────────────────────────────────────

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
    icon?: React.ComponentType<{className?: string}>;
  }
>;

// ─── Context ─────────────────────────────────────────────────────────────────

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) {
    throw new Error('useChart must be used inside <ChartContainer>');
  }
  return ctx;
}

// ─── ChartContainer ───────────────────────────────────────────────────────────

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
  children: React.ReactElement;
}

function ChartContainer({config, children, className, ...props}: ChartContainerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dims, setDims] = React.useState<{w: number; h: number} | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect;
      if (width > 0 && height > 0) {
        setDims({w: width, h: height});
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const style = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [`--color-${key}`, value.color ?? 'currentColor'])
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={{config}}>
      <div ref={containerRef} className={cn('w-full', className)} style={{minHeight: 120, ...style}} {...props}>
        {dims && (
          <ResponsiveContainer width={dims.w} height={dims.h}>
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = Tooltip;

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: ReadonlyArray<Payload<ValueType, NameType>>;
  label?: React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: 'dot' | 'line' | 'dashed';
  labelKey?: string;
  nameKey?: string;
  formatter?: Formatter<ValueType, NameType>;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  hideIndicator = false,
  indicator = 'dot',
  labelKey,
  nameKey,
  formatter
}: ChartTooltipContentProps) {
  const {config} = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className="grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-xl"
      style={{backgroundColor: 'hsl(var(--popover))'}}
    >
      {!hideLabel && <p className="font-medium text-foreground">{labelKey ? (config[labelKey]?.label ?? label) : label}</p>}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = (nameKey ?? (item.name as string) ?? item.dataKey ?? 'value') as string;
          const cfg = config[key];
          const color = (item.color as string | undefined) ?? cfg?.color ?? 'currentColor';
          const displayName = cfg?.label ?? item.name;
          const formatted = formatter
            ? formatter(
                item.value,
                item.name as NameType,
                item as Payload<ValueType, NameType>,
                index,
                payload as ReadonlyArray<Payload<ValueType, NameType>>
              )
            : item.value;

          return (
            <div key={index} className="flex items-center gap-2">
              {!hideIndicator && (
                <span
                  className={cn('shrink-0', {
                    'h-2 w-2 rounded-full': indicator === 'dot',
                    'h-0.5 w-4 bg-current': indicator === 'line',
                    'h-0.5 w-4 border-dashed border-t': indicator === 'dashed'
                  })}
                  style={{backgroundColor: indicator === 'dot' ? color : undefined, color: indicator !== 'dot' ? color : undefined}}
                />
              )}
              <span className="text-muted-foreground">{displayName}</span>
              <span className="ml-auto font-mono font-medium text-foreground tabular-nums">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ChartLegendContentProps extends React.HTMLAttributes<HTMLDivElement> {
  payload?: Array<{value: string; color?: string; dataKey?: string}>;
  nameKey?: string;
  hideIcon?: boolean;
}

function ChartLegendContent({payload = [], className, nameKey, hideIcon = false}: ChartLegendContentProps) {
  const {config} = useChart();

  if (!payload.length) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-4 text-xs', className)}>
      {payload.map((item) => {
        const key = nameKey ?? item.dataKey ?? item.value;
        const cfg = config[key];
        const color = item.color ?? cfg?.color ?? 'currentColor';
        return (
          <div key={item.value} className="flex items-center gap-1.5">
            {!hideIcon && <span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor: color}} />}
            <span className="text-muted-foreground">{cfg?.label ?? item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export {ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegendContent};
