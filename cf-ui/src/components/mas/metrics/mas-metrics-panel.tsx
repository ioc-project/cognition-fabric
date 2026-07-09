// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useMemo, useRef, useState} from 'react';
import {useSearchParams, useRouter, usePathname} from 'next/navigation';
import type {DateRange} from 'react-day-picker';
import {DayPicker} from 'react-day-picker';
import {useMASMetrics} from '@/hooks/useMASMetrics';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {MASMetricsChart} from './mas-metrics-chart';
import {StatCard} from '@/components/ui/stat-card';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {cn} from '@/lib/utils';
import {Activity, AlertTriangle, CalendarIcon, ChevronDown, Download, FileText, Image, Layers} from 'lucide-react';
import {ViewToggle} from '@/components/ui/view-toggle';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {EmptyState} from '@/components/ui/empty-state';

const TIME_PRESETS = [
  {label: '1h', hours: 1},
  {label: '6h', hours: 6},
  {label: '24h', hours: 24},
  {label: '7d', hours: 168},
  {label: '30d', hours: 720},
  {label: '1y', hours: 8760}
] as const;

type PresetLabel = (typeof TIME_PRESETS)[number]['label'];

function formatMetricValue(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatMetricLabel(name: string): string {
  return name.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatServiceLabel(service: string): string {
  return service.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeTimeRange(
  preset: PresetLabel | 'custom',
  customStart: string | null,
  customEnd: string | null
): {start: Date; end: Date; hours: number} {
  const now = new Date();
  if (preset !== 'custom') {
    const hours = TIME_PRESETS.find((p) => p.label === preset)!.hours;
    return {start: new Date(now.getTime() - hours * 3_600_000), end: now, hours};
  }
  const start = customStart ? new Date(customStart) : new Date(now.getTime() - 24 * 3_600_000);
  const end = customEnd ? new Date(customEnd) : now;
  return {start, end, hours: (end.getTime() - start.getTime()) / 3_600_000};
}

export interface CognitionEngineRef {
  ce_id: string;
  name?: string | null;
}

export interface AgentRef {
  agent_id: string;
  name?: string | null;
}

interface MASMetricsPanelProps {
  masId: string;
  cognitionEngines?: CognitionEngineRef[];
  agents?: AgentRef[];
}

const PRIORITY_METRICS = [
  'llm.tokens.total',
  'llm.tokens.prompt',
  'llm.tokens.completion',
  'llm.latency_ms',
  'total_tokens',
  'prompt_tokens',
  'completion_tokens',
  'latency',
  'cost'
];

export function MASMetricsPanel({masId, cognitionEngines = [], agents = []}: MASMetricsPanelProps) {
  const {defaultWorkspaceId} = useDefaultWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);
  const chartAreaRef = useRef<HTMLDivElement>(null);

  // --- URL-synced filter state ---
  const activePreset = (searchParams.get('preset') as PresetLabel | 'custom') || '24h';
  const customStart = searchParams.get('start');
  const customEnd = searchParams.get('end');
  const selectedCE = searchParams.get('ce_id') || '';
  const selectedAgent = searchParams.get('agent_id') || '';
  const selectedService = searchParams.get('service') || '';
  // 'view' is only set when the user explicitly overrides; grid is always the default
  const explicitView = searchParams.get('view') as 'grid' | 'single' | null;

  const showComparison = searchParams.get('compare') === '1';

  const hasFilters = !!(selectedCE || selectedAgent || selectedService);
  const currentView: 'grid' | 'single' = explicitView ?? 'grid';

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val != null) {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }
    router.replace(`${pathname}?${params.toString()}`, {scroll: false});
  }

  function handlePresetClick(label: PresetLabel) {
    updateParams({preset: label, start: null, end: null});
    setTimePickerOpen(false);
  }

  function handlePickerOpenChange(open: boolean) {
    if (open) {
      setPendingRange(customRangeValue);
    }
    setTimePickerOpen(open);
  }

  function handleCustomRange(range: DateRange | undefined) {
    setPendingRange(range);
    if (range?.from && range?.to) {
      const sameDay = range.from.toDateString() === range.to.toDateString();
      if (!sameDay) {
        updateParams({
          preset: 'custom',
          start: range.from.toISOString(),
          end: range.to.toISOString()
        });
        setTimePickerOpen(false);
      }
    }
  }

  function handleFilterChange(key: 'ce_id' | 'agent_id' | 'service', value: string) {
    const newVal = value === 'all' ? null : value;
    updateParams({[key]: newVal});
  }

  function handleClearFilters() {
    updateParams({ce_id: null, agent_id: null, service: null, view: null});
  }

  function toggleComparison() {
    updateParams({compare: showComparison ? null : '1'});
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCSV() {
    if (!data) {
      return;
    }
    const rows: string[] = ['timestamp,metric_name,ce_id,service,value'];
    for (const ce of data.ces) {
      for (const s of ce.series) {
        const service = (s.attributes?.service as string | undefined) ?? '';
        for (const [ts, val] of s.datapoints) {
          rows.push([ts, s.metric_name, ce.ce_id, service, String(val)].join(','));
        }
      }
    }
    const blob = new Blob([rows.join('\n')], {type: 'text/csv;charset=utf-8'});
    triggerDownload(URL.createObjectURL(blob), `metrics-${masId}-${activePreset}.csv`);
  }

  function svgToCanvas(svg: SVGElement): Promise<HTMLCanvasElement> {
    return new Promise((resolve) => {
      const {width, height} = svg.getBoundingClientRect();
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(width));
      clone.setAttribute('height', String(height));
      const svgStr = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgStr], {type: 'image/svg+xml'});
      const url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        resolve(canvas);
      };
      img.src = url;
    });
  }

  async function exportPNG() {
    const container = chartAreaRef.current;
    if (!container) {
      return;
    }
    const svgs = Array.from(container.querySelectorAll('svg'));
    if (!svgs.length) {
      return;
    }
    setIsExporting(true);
    try {
      const canvases = await Promise.all(svgs.map(svgToCanvas));
      const valid = canvases.filter((c) => c.width > 1);
      if (!valid.length) {
        return;
      }
      if (valid.length === 1) {
        valid[0].toBlob((blob) => {
          if (blob) {
            triggerDownload(URL.createObjectURL(blob), `metrics-${masId}-${activePreset}.png`);
          }
        }, 'image/png');
      } else {
        const gapPx = 16 * 2; // 16 css-px gap at 2× scale
        const cols = 2;
        const rows = Math.ceil(valid.length / cols);
        const cellW = Math.max(...valid.map((c) => c.width));
        const cellH = Math.max(...valid.map((c) => c.height));
        const totalW = cols * cellW + (cols - 1) * gapPx;
        const totalH = rows * cellH + (rows - 1) * gapPx;
        const final = document.createElement('canvas');
        final.width = totalW;
        final.height = totalH;
        const ctx = final.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalW, totalH);
        valid.forEach((c, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          ctx.drawImage(c, col * (cellW + gapPx), row * (cellH + gapPx));
        });
        final.toBlob((blob) => {
          if (blob) {
            triggerDownload(URL.createObjectURL(blob), `metrics-${masId}-${activePreset}.png`);
          }
        }, 'image/png');
      }
    } finally {
      setIsExporting(false);
    }
  }

  // --- Time range ---
  const {
    start,
    end,
    hours: rangeHours
  } = useMemo(() => computeTimeRange(activePreset, customStart, customEnd), [activePreset, customStart, customEnd]);

  const timePickerLabel = useMemo(() => {
    if (activePreset !== 'custom') {
      return `Last ${activePreset}`;
    }
    if (!customStart) {
      return 'Custom range';
    }
    const from = new Date(customStart);
    const to = customEnd ? new Date(customEnd) : new Date();
    return `${from.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} – ${to.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`;
  }, [activePreset, customStart, customEnd]);

  const customRangeValue: DateRange | undefined = useMemo(() => {
    if (!customStart) {
      return undefined;
    }
    return {from: new Date(customStart), to: customEnd ? new Date(customEnd) : undefined};
  }, [customStart, customEnd]);

  // --- Data fetch ---
  const filters = useMemo(
    () => ({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      ...(selectedCE && {ce_id: selectedCE}),
      ...(selectedAgent && {agent_id: selectedAgent})
    }),
    [start, end, selectedCE, selectedAgent]
  );

  // Previous period: same duration, shifted back
  const prevFilters = useMemo(() => {
    const duration = end.getTime() - start.getTime();
    return {
      start_time: new Date(start.getTime() - duration).toISOString(),
      end_time: start.toISOString(),
      ...(selectedCE && {ce_id: selectedCE}),
      ...(selectedAgent && {agent_id: selectedAgent})
    };
  }, [start, end, selectedCE, selectedAgent]);

  const trendLabel = useMemo(() => {
    if (activePreset === '1h') {
      return 'vs prev hour';
    }
    if (activePreset === '6h') {
      return 'vs prev 6h';
    }
    if (activePreset === '24h') {
      return 'vs prev day';
    }
    if (activePreset === '7d') {
      return 'vs prev week';
    }
    if (activePreset === '30d') {
      return 'vs prev month';
    }
    if (activePreset === '1y') {
      return 'vs prev year';
    }
    return 'vs prev period';
  }, [activePreset]);

  const {data, isLoading, error, mutate} = useMASMetrics(defaultWorkspaceId, masId, defaultWorkspaceId ? filters : null);
  const {data: prevData} = useMASMetrics(defaultWorkspaceId, masId, defaultWorkspaceId ? prevFilters : null);

  // --- Derived data ---

  // Unique services from response (for filter dropdown)
  const services = useMemo(() => {
    if (!data?.ces) {
      return [];
    }
    const set = new Set<string>();
    for (const ce of data.ces) {
      for (const s of ce.series) {
        const svc = s.attributes?.service as string | undefined;
        if (svc) {
          set.add(svc);
        }
      }
    }
    return Array.from(set).sort();
  }, [data]);

  // Totals per metric_name (across selected service if filtered)
  const statTotals = useMemo(() => {
    if (!data?.ces) {
      return new Map<string, number>();
    }
    const totals = new Map<string, number>();
    for (const ce of data.ces) {
      for (const s of ce.series) {
        if (selectedService && (s.attributes?.service as string | undefined) !== selectedService) {
          continue;
        }
        const sum = s.datapoints.reduce((acc, [, val]) => acc + val, 0);
        totals.set(s.metric_name, (totals.get(s.metric_name) ?? 0) + sum);
      }
    }
    return totals;
  }, [data, selectedService]);

  // Metric names, priority-sorted
  const metricNames = useMemo(() => {
    if (!data?.ces) {
      return [];
    }
    const names = new Set<string>();
    for (const ce of data.ces) {
      for (const s of ce.series) {
        if (selectedService && (s.attributes?.service as string | undefined) !== selectedService) {
          continue;
        }
        names.add(s.metric_name);
      }
    }
    return Array.from(names).sort((a, b) => {
      const ai = PRIORITY_METRICS.indexOf(a);
      const bi = PRIORITY_METRICS.indexOf(b);
      if (ai !== -1 && bi !== -1) {
        return ai - bi;
      }
      if (ai !== -1) {
        return -1;
      }
      if (bi !== -1) {
        return 1;
      }
      return a.localeCompare(b);
    });
  }, [data, selectedService]);

  // Totals for previous period (same service filter)
  const prevStatTotals = useMemo(() => {
    if (!prevData?.ces) {
      return new Map<string, number>();
    }
    const totals = new Map<string, number>();
    for (const ce of prevData.ces) {
      for (const s of ce.series) {
        if (selectedService && (s.attributes?.service as string | undefined) !== selectedService) {
          continue;
        }
        const sum = s.datapoints.reduce((acc, [, val]) => acc + val, 0);
        totals.set(s.metric_name, (totals.get(s.metric_name) ?? 0) + sum);
      }
    }
    return totals;
  }, [prevData, selectedService]);

  const statCards = useMemo(() => {
    const entries = Array.from(statTotals.entries());
    const prioritised = PRIORITY_METRICS.filter((k) => statTotals.has(k)).map((k) => [k, statTotals.get(k)!] as [string, number]);
    const rest = entries.filter(([k]) => !PRIORITY_METRICS.includes(k));
    return [...prioritised, ...rest].slice(0, 4).map(([name, total]) => {
      const prev = prevStatTotals.get(name);
      const trend = prev !== undefined ? (prev === 0 ? null : ((total - prev) / prev) * 100) : null;
      return {name, total, trend};
    });
  }, [statTotals, prevStatTotals]);

  const is413 = error && (error as {status?: number}).status === 413;
  const hasData = data && data.ces.length > 0 && data.ces.some((ce) => ce.series.some((s) => s.datapoints.length > 0));
  const hasPrevData = prevData && prevData.ces.some((ce) => ce.series.some((s) => s.datapoints.length > 0));

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <DropdownMenu open={timePickerOpen} onOpenChange={handlePickerOpenChange}>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 h-8 px-3 text-sm border rounded-md bg-background hover:bg-muted/60 transition-colors font-medium">
              <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
              {timePickerLabel}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="p-3 w-auto" align="start">
            <div className="flex items-center gap-1 mb-3">
              {TIME_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handlePresetClick(p.label)}
                  className={cn(
                    'px-3 py-1 text-sm rounded-md transition-colors font-medium',
                    activePreset === p.label ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border-t pt-3" onPointerDown={(e) => e.stopPropagation()}>
              <DayPicker
                mode="range"
                selected={pendingRange}
                onSelect={handleCustomRange}
                showWeekNumber={false}
                className="mds-day-picker !m-0 !p-0"
                modifiersStyles={{
                  today: {
                    color: 'hsl(var(--sidebar-text-active))',
                    fontWeight: 700
                  }
                }}
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border" />

        {services.length > 0 && (
          <Select value={selectedService || 'all'} onValueChange={(v) => handleFilterChange('service', v)}>
            <SelectTrigger surface="field" className="h-8 text-sm w-[200px]">
              <SelectValue placeholder="All Services" />
            </SelectTrigger>
            <SelectContent surface="field">
              <SelectItem value="all">All Services</SelectItem>
              {services.map((svc) => (
                <SelectItem key={svc} value={svc}>
                  {formatServiceLabel(svc)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {cognitionEngines.length > 0 && (
          <Select value={selectedCE || 'all'} onValueChange={(v) => handleFilterChange('ce_id', v)}>
            <SelectTrigger surface="field" className="h-8 text-sm w-[190px]">
              <SelectValue placeholder="All Cognition Engines" />
            </SelectTrigger>
            <SelectContent surface="field">
              <SelectItem value="all">All Cognition Engines</SelectItem>
              {cognitionEngines.map((ce) => (
                <SelectItem key={ce.ce_id} value={ce.ce_id}>
                  {ce.name || ce.ce_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {agents.length > 0 && (
          <Select value={selectedAgent || 'all'} onValueChange={(v) => handleFilterChange('agent_id', v)}>
            <SelectTrigger surface="field" className="h-8 text-sm w-[160px]">
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent surface="field">
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.agent_id} value={a.agent_id}>
                  {a.name || a.agent_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasFilters && (
          <button onClick={handleClearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2">
            Clear filters
          </button>
        )}

        {(hasData || isLoading) && (
          <TooltipProvider delayDuration={200}>
            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleComparison}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors',
                      showComparison
                        ? 'border-primary text-primary bg-primary/5 font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Compare
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Overlay previous period</TooltipContent>
              </Tooltip>

              <ViewToggle
                options={[
                  {value: 'grid', label: 'Grid'},
                  {value: 'single', label: 'Single'}
                ]}
                value={currentView}
                onChange={(v) => updateParams({view: v === 'grid' ? null : v})}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={isExporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={exportCSV} className="gap-2 cursor-pointer">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportPNG} disabled={isExporting} className="gap-2 cursor-pointer">
                    <Image className="w-3.5 h-3.5 text-muted-foreground" />
                    {isExporting ? 'Exporting…' : 'Export PNG'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TooltipProvider>
        )}
      </div>

      {showComparison && !hasPrevData && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs text-muted-foreground shrink-0">
          <Layers className="w-3.5 h-3.5 shrink-0" />
          No data found for the previous {trendLabel.replace('vs prev ', '')}. Try a longer time range to see a comparison.
        </div>
      )}

      {(isLoading || data === undefined) && !hasData ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-28 rounded bg-muted animate-pulse" />
                <div className="h-3 w-16 rounded bg-muted/60 animate-pulse mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : statCards.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          {statCards.map(({name, total, trend}) => (
            <StatCard key={name} label={formatMetricLabel(name)} value={formatMetricValue(total)} trend={trend} trendLabel={trendLabel} />
          ))}
        </div>
      ) : null}

      {is413 && (
        <div className="flex items-start gap-4 p-4 rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Too many data points</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The selected range returned more data than can be displayed. Narrow the time window or apply a CE or service filter.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground">Try a shorter range:</span>
              {(['1h', '6h', '24h', '7d'] as const).map((label) => (
                <button
                  key={label}
                  onClick={() => handlePresetClick(label)}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {data !== undefined && !isLoading && !is413 && error && (
        <div className="p-6 border rounded-lg bg-card soft-card flex items-center justify-center flex-1 min-h-[300px]">
          <EmptyState
            variant="inset"
            icon={AlertTriangle}
            title="Failed to load metrics"
            description="There was a problem fetching data for this time range."
            actionLabel="Retry"
            onAction={() => mutate()}
          />
        </div>
      )}

      {data !== undefined && !isLoading && !error && !hasData && !is413 && (
        <div className="p-6 border rounded-lg bg-card soft-card flex items-center justify-center flex-1 min-h-[300px]">
          <EmptyState
            variant="inset"
            icon={Activity}
            title={hasFilters ? 'No data for these filters' : 'No activity recorded'}
            description={
              hasFilters
                ? 'No metrics match the current filter combination. Try adjusting the filters or broadening the time range.'
                : 'This MAS has not recorded any metrics in the selected time window. Try expanding the time range.'
            }
            actionLabel={hasFilters ? 'Clear filters' : 'Expand to 7 days'}
            onAction={hasFilters ? handleClearFilters : () => handlePresetClick('7d')}
          />
        </div>
      )}

      {hasData && metricNames.length > 0 && (
        <div ref={chartAreaRef} style={{display: 'contents'}}>
          {currentView === 'grid' ? (
            <div className={cn('grid gap-4 flex-1 min-h-0', metricNames.length > 1 ? 'md:grid-cols-2 auto-rows-fr' : 'grid-cols-1')}>
              {metricNames.map((metricName) => (
                <Card key={metricName} className="flex flex-col min-h-[220px] overflow-hidden">
                  <CardHeader className="pb-2 pt-4 px-5 shrink-0">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {formatMetricLabel(metricName)}
                      </CardTitle>
                      {statTotals.has(metricName) && (
                        <span className="text-lg font-bold text-foreground">{formatMetricValue(statTotals.get(metricName)!)}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0 px-3 pb-3">
                    <MASMetricsChart
                      response={data!}
                      rangeHours={rangeHours}
                      metricFilter={metricName}
                      serviceFilter={selectedService || undefined}
                      prevResponse={showComparison ? (prevData ?? undefined) : undefined}
                      syncId={masId}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col flex-1 min-h-[300px] overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-5 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {rangeHours > 7 * 24 ? 'Usage histogram' : 'Usage over time'}
                  </CardTitle>
                  {metricNames.length > 1 && <span className="text-xs text-amber-500/80">Mixed units — use grid view for per-metric Y-axes</span>}
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 px-3 pb-3">
                <MASMetricsChart
                  response={data!}
                  rangeHours={rangeHours}
                  serviceFilter={selectedService || undefined}
                  prevResponse={showComparison ? (prevData ?? undefined) : undefined}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {(isLoading || data === undefined) && !hasData && (
        <div className="grid gap-4 flex-1 min-h-0 md:grid-cols-2 auto-rows-fr">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="flex flex-col min-h-[220px]">
              <CardHeader className="pb-2 pt-4 px-5 shrink-0">
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              </CardHeader>
              <CardContent className="flex-1 min-h-0 px-3 pb-3">
                <div className="h-full rounded bg-muted/50 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
