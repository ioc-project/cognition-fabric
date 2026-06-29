// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useMemo} from 'react';
import type React from 'react';
import {LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend} from 'recharts';
import type {Props as LegendContentProps, LegendPayload} from 'recharts/types/component/DefaultLegendContent';
import {ChartContainer, ChartTooltip, ChartTooltipContent} from '@/components/ui/chart';
import type {ChartConfig} from '@/components/ui/chart';
import type {MASMetricsResponse} from '@/api/endpoints/mas-metrics';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)'
];

function WideCursor({x = 0, y = 0, width = 0, height = 0}: {x?: number; y?: number; width?: number; height?: number}) {
  const pad = 20;
  return <rect x={x - pad} y={y} width={width + pad * 2} height={height} fill="currentColor" fillOpacity={0.06} />;
}

function formatValue(v: number): string {
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1)}M`;
  }
  if (v >= 1_000) {
    return `${(v / 1_000).toFixed(1)}K`;
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function getBucketGranularity(rangeHours: number): 'day' | 'week' | 'month' {
  if (rangeHours <= 30 * 24) {
    return 'day';
  }
  if (rangeHours <= 90 * 24) {
    return 'week';
  }
  return 'month';
}

function bucketTimestamp(timestamp: string, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(timestamp);
  if (granularity === 'month') {
    return d.toISOString().slice(0, 7);
  }
  if (granularity === 'week') {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function formatBucketLabel(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(bucket.length === 7 ? `${bucket}-01` : bucket);
  if (granularity === 'month') {
    return d.toLocaleDateString('en-US', {month: 'short', year: 'numeric'});
  }
  if (granularity === 'week') {
    return `w/ ${d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`;
  }
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

function formatTimeLabel(timestamp: string, rangeHours: number): string {
  const d = new Date(timestamp);
  if (rangeHours <= 24) {
    return d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: false});
  }
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false});
}

/** Resolve a human-readable series label from attributes.service, falling back to CE id. */
function resolveService(s: {attributes?: Record<string, unknown>}, ceId: string): string {
  return (s.attributes?.service as string | undefined) || ceId.slice(0, 8);
}

/**
 * Build a stable service→color map by sorting all unique services across the
 * entire response. This ensures the same service always gets the same color
 * regardless of which metric chart is being rendered.
 */
function buildServiceColorMap(response: MASMetricsResponse): Map<string, string> {
  const services = new Set<string>();
  for (const ce of response.ces) {
    for (const s of ce.series) {
      services.add(resolveService(s, ce.ce_id));
    }
  }
  const map = new Map<string, string>();
  let i = 0;
  for (const svc of Array.from(services).sort()) {
    map.set(svc, CHART_COLORS[i++ % CHART_COLORS.length]);
  }
  return map;
}

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  isPrev?: boolean;
}

function buildLineData(
  response: MASMetricsResponse,
  rangeHours: number,
  metricFilter?: string,
  serviceFilter?: string,
  prevResponse?: MASMetricsResponse
) {
  const colorMap = buildServiceColorMap(response);
  const seriesMap = new Map<string, SeriesDef>();
  const timeMap = new Map<string, Record<string, number>>();
  const shiftMs = rangeHours * 3_600_000;

  for (const ce of response.ces) {
    for (const s of ce.series) {
      if (metricFilter && s.metric_name !== metricFilter) {
        continue;
      }
      const service = resolveService(s, ce.ce_id);
      if (serviceFilter && service !== serviceFilter) {
        continue;
      }
      const key = `${s.metric_name}__${service}`;
      if (!seriesMap.has(key)) {
        const label = metricFilter ? service : `${s.metric_name} (${service})`;
        seriesMap.set(key, {key, label, color: colorMap.get(service) ?? CHART_COLORS[0]});
      }
      for (const [ts, val] of s.datapoints) {
        const existing = timeMap.get(ts) ?? {};
        existing[key] = (existing[key] ?? 0) + val;
        timeMap.set(ts, existing);
      }
    }
  }

  if (prevResponse) {
    for (const ce of prevResponse.ces) {
      for (const s of ce.series) {
        if (metricFilter && s.metric_name !== metricFilter) {
          continue;
        }
        const service = resolveService(s, ce.ce_id);
        if (serviceFilter && service !== serviceFilter) {
          continue;
        }
        const key = `prev__${s.metric_name}__${service}`;
        if (!seriesMap.has(key)) {
          const label = metricFilter ? service : `${s.metric_name} (${service})`;
          seriesMap.set(key, {key, label, color: colorMap.get(service) ?? CHART_COLORS[0], isPrev: true});
        }
        for (const [ts, val] of s.datapoints) {
          const shiftedTs = new Date(new Date(ts).getTime() + shiftMs).toISOString();
          const existing = timeMap.get(shiftedTs) ?? {};
          existing[key] = (existing[key] ?? 0) + val;
          timeMap.set(shiftedTs, existing);
        }
      }
    }
  }

  const data = Array.from(timeMap.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([ts, vals]) => ({_ts: ts, _label: formatTimeLabel(ts, rangeHours), ...vals}));

  const series = Array.from(seriesMap.values()).sort((a, b) => (a.isPrev ? -1 : 1) - (b.isPrev ? -1 : 1));
  return {data, series};
}

function buildBarData(
  response: MASMetricsResponse,
  rangeHours: number,
  metricFilter?: string,
  serviceFilter?: string,
  prevResponse?: MASMetricsResponse
) {
  const colorMap = buildServiceColorMap(response);
  const granularity = getBucketGranularity(rangeHours);
  const seriesMap = new Map<string, SeriesDef>();
  const bucketMap = new Map<string, Record<string, number>>();
  const shiftMs = rangeHours * 3_600_000;

  for (const ce of response.ces) {
    for (const s of ce.series) {
      if (metricFilter && s.metric_name !== metricFilter) {
        continue;
      }
      const service = resolveService(s, ce.ce_id);
      if (serviceFilter && service !== serviceFilter) {
        continue;
      }
      const key = `${s.metric_name}__${service}`;
      const label = metricFilter ? service : `${s.metric_name} (${service})`;
      if (!seriesMap.has(key)) {
        seriesMap.set(key, {key, label, color: colorMap.get(service) ?? CHART_COLORS[0]});
      }
      for (const [ts, val] of s.datapoints) {
        const bucket = bucketTimestamp(ts, granularity);
        const existing = bucketMap.get(bucket) ?? {};
        existing[key] = (existing[key] ?? 0) + val;
        bucketMap.set(bucket, existing);
      }
    }
  }

  if (prevResponse) {
    for (const ce of prevResponse.ces) {
      for (const s of ce.series) {
        if (metricFilter && s.metric_name !== metricFilter) {
          continue;
        }
        const service = resolveService(s, ce.ce_id);
        if (serviceFilter && service !== serviceFilter) {
          continue;
        }
        const key = `prev__${s.metric_name}__${service}`;
        const label = metricFilter ? service : `${s.metric_name} (${service})`;
        if (!seriesMap.has(key)) {
          seriesMap.set(key, {key, label, color: colorMap.get(service) ?? CHART_COLORS[0], isPrev: true});
        }
        for (const [ts, val] of s.datapoints) {
          const shiftedTs = new Date(new Date(ts).getTime() + shiftMs).toISOString();
          const bucket = bucketTimestamp(shiftedTs, granularity);
          const existing = bucketMap.get(bucket) ?? {};
          existing[key] = (existing[key] ?? 0) + val;
          bucketMap.set(bucket, existing);
        }
      }
    }
  }

  const data = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, vals]) => ({_bucket: bucket, _label: formatBucketLabel(bucket, granularity), ...vals}));

  const series = Array.from(seriesMap.values()).sort((a, b) => (a.isPrev ? -1 : 1) - (b.isPrev ? -1 : 1));
  return {data, series};
}

interface Props {
  response: MASMetricsResponse;
  rangeHours: number;
  metricFilter?: string;
  serviceFilter?: string;
  /** When provided, overlays this data as dashed/dimmed previous-period lines. */
  prevResponse?: MASMetricsResponse;
  syncId?: string;
}

export function MASMetricsChart({response, rangeHours, metricFilter, serviceFilter, prevResponse, syncId}: Props) {
  const isHistogram = rangeHours > 7 * 24;
  const height = 'h-full';

  const {data, series} = useMemo<{data: Record<string, unknown>[]; series: SeriesDef[]}>(() => {
    if (isHistogram) {
      return buildBarData(response, rangeHours, metricFilter, serviceFilter, prevResponse);
    }
    return buildLineData(response, rangeHours, metricFilter, serviceFilter, prevResponse);
  }, [response, rangeHours, isHistogram, metricFilter, serviceFilter, prevResponse]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 h-full min-h-[120px] text-center">
        <p className="text-xs font-medium text-muted-foreground">No data in this range</p>
        <p className="text-xs text-muted-foreground/60">Activity may exist outside the selected window</p>
      </div>
    );
  }

  const chartConfig: ChartConfig = Object.fromEntries(series.map((s) => [s.key, {label: s.label, color: s.color}]));
  const commonAxisProps = {tick: {fontSize: 11, fill: 'hsl(var(--muted-foreground))'}, tickLine: false};

  const legendContent = ({payload}: LegendContentProps) => {
    if (!payload?.length || series.length <= 1) {
      return null;
    }
    return (
      <div className="flex flex-wrap justify-center gap-4 pt-2 text-xs">
        {(payload as ReadonlyArray<LegendPayload>).map((p, i) => (
          <span key={i} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{backgroundColor: p.color as string | undefined}} />
            {p.value != null ? (chartConfig[String(p.value)]?.label ?? String(p.value)) : ''}
          </span>
        ))}
      </div>
    );
  };

  const tooltipStyle: React.CSSProperties = {top: 8, right: 0, left: 'auto', transform: 'none', bottom: 'auto'};

  if (isHistogram) {
    return (
      <ChartContainer config={chartConfig} className={height}>
        <BarChart data={data} syncId={syncId} margin={{top: 4, right: 16, left: 0, bottom: 4}}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.1} />
          <XAxis dataKey="_label" {...commonAxisProps} />
          <YAxis tickFormatter={formatValue} {...commonAxisProps} width={48} />
          <ChartTooltip
            cursor={<WideCursor />}
            content={<ChartTooltipContent formatter={(v) => formatValue(v as number)} />}
            wrapperStyle={tooltipStyle}
          />
          <Legend content={legendContent} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              fillOpacity={s.isPrev ? 0.3 : 1}
              radius={[3, 3, 0, 0]}
              maxBarSize={48}
              legendType={s.isPrev ? 'none' : 'rect'}
            />
          ))}
        </BarChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={chartConfig} className={height}>
      <LineChart data={data} syncId={syncId} margin={{top: 4, right: 16, left: 0, bottom: 4}}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.1} />
        <XAxis dataKey="_label" {...commonAxisProps} interval="preserveStartEnd" />
        <YAxis tickFormatter={formatValue} {...commonAxisProps} width={48} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatValue(v as number)} />} wrapperStyle={tooltipStyle} />
        <Legend content={legendContent} />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={s.isPrev ? 1.5 : 2}
            strokeDasharray={s.isPrev ? '5 3' : undefined}
            strokeOpacity={s.isPrev ? 0.45 : 1}
            dot={s.isPrev ? false : {r: 2.5, fill: s.color, strokeWidth: 0}}
            activeDot={s.isPrev ? {r: 3, strokeOpacity: 0.45} : {r: 4}}
            connectNulls
            legendType={s.isPrev ? 'none' : 'line'}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
