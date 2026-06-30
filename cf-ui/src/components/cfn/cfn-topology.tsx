// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {X} from 'lucide-react';
import type {CognitionFabricNodeTopology, MemoryProviderListItem} from '@/api/endpoints/cfn';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';
import {dtLabel, dtRow, dtValue, dtSectionHeader} from '@/lib/detail-typography';
import {cn} from '@/lib/utils';

// ─── Canvas config ────────────────────────────────────────────────────────────

const W = 960;
const CFN_R = 44;
const CE_R = 34;
const MP_R = 30;
const COLS = {cfn: 160, ce: 440, mem: 740};
const PADDING_TOP = 70;
const NODE_GAP = 130;

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  cfnOnline: '#0066cc',
  cfnOffline: '#d9202f',
  engine: '#0d7a55',
  memory: '#6b3fa0',
  edgeOnline: 'rgba(0,102,204,0.18)',
  edgeOffline: 'rgba(217,32,47,0.18)',
  edgeActive: 'rgba(0,102,204,0.75)',
  dim: '#8aaac8',
  muted: '#4a6a8a'
};

// ─── Types ────────────────────────────────────────────────────────────────────

type CENode = CognitionEngineListItem & {cfnId: string};
type MPNode = MemoryProviderListItem;

type Selected = {kind: 'cfn'; id: string; ceIds: string[]} | {kind: 'ce'; id: string; cfnId: string} | {kind: 'mp'; id: string} | null;

type Edge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  online: boolean;
  type: 'cfn-ce' | 'ce-mp';
  cfnId?: string;
  ceId?: string;
  mpId?: string;
};

// ─── Layout ───────────────────────────────────────────────────────────────────

function computeLayout(nodes: CognitionFabricNodeTopology[]) {
  const ceMap = new Map<string, CENode>();
  const mpMap = new Map<string, MPNode>();

  for (const node of nodes) {
    for (const ce of node.cognition_engines ?? []) {
      if (!ceMap.has(ce.id)) {
        ceMap.set(ce.id, {...ce, cfnId: node.id});
      }
    }
    for (const mp of node.memory_providers ?? []) {
      if (!mpMap.has(mp.id)) {
        mpMap.set(mp.id, mp);
      }
    }
  }

  const allCEs = Array.from(ceMap.values());
  const allMPs = Array.from(mpMap.values());
  const rows = Math.max(nodes.length, allCEs.length, allMPs.length, 1);
  const H = Math.max(400, PADDING_TOP + rows * NODE_GAP + 80);

  const cfnPos = new Map(nodes.map((n, i) => [n.id, {cx: COLS.cfn, cy: PADDING_TOP + i * NODE_GAP + NODE_GAP / 2}]));
  const cePos = new Map(allCEs.map((ce, i) => [ce.id, {cx: COLS.ce, cy: PADDING_TOP + i * NODE_GAP + NODE_GAP / 2}]));
  const mpPos = new Map(allMPs.map((mp, i) => [mp.id, {cx: COLS.mem, cy: PADDING_TOP + i * NODE_GAP + NODE_GAP / 2}]));

  return {allCEs, allMPs, cfnPos, cePos, mpPos, H};
}

function buildEdges(
  nodes: CognitionFabricNodeTopology[],
  cfnPos: Map<string, {cx: number; cy: number}>,
  cePos: Map<string, {cx: number; cy: number}>,
  mpPos: Map<string, {cx: number; cy: number}>
): Edge[] {
  const edges: Edge[] = [];
  const seenCeMp = new Set<string>();

  for (const node of nodes) {
    const cp = cfnPos.get(node.id);
    if (!cp) {
      continue;
    }

    for (const ce of node.cognition_engines ?? []) {
      const ep = cePos.get(ce.id);
      if (!ep) {
        continue;
      }

      edges.push({
        id: `cfn-ce-${node.id}-${ce.id}`,
        x1: cp.cx + CFN_R,
        y1: cp.cy,
        x2: ep.cx - CE_R,
        y2: ep.cy,
        online: node.status === 'online' && ce.status === 'online',
        type: 'cfn-ce',
        cfnId: node.id,
        ceId: ce.id
      });

      for (const mp of node.memory_providers ?? []) {
        const mpp = mpPos.get(mp.id);
        if (!mpp) {
          continue;
        }
        const key = `${ce.id}-${mp.id}`;
        if (seenCeMp.has(key)) {
          continue;
        }
        seenCeMp.add(key);
        edges.push({
          id: `ce-mp-${ce.id}-${mp.id}`,
          x1: ep.cx + CE_R,
          y1: ep.cy,
          x2: mpp.cx - MP_R,
          y2: mpp.cy,
          online: node.status === 'online' && ce.status === 'online',
          type: 'ce-mp',
          ceId: ce.id,
          mpId: mp.id
        });
      }
    }
  }

  return edges;
}

function isEdgeActive(edge: Edge, sel: Selected): boolean {
  if (!sel) {
    return false;
  }
  if (sel.kind === 'cfn') {
    if (edge.type === 'cfn-ce') {
      return edge.cfnId === sel.id;
    }
    if (edge.type === 'ce-mp') {
      return sel.ceIds.includes(edge.ceId ?? '');
    }
  }
  if (sel.kind === 'ce') {
    return edge.ceId === sel.id;
  }
  if (sel.kind === 'mp') {
    return edge.type === 'ce-mp' && edge.mpId === sel.id;
  }
  return false;
}

// Cubic bezier path
function bez(x1: number, y1: number, x2: number, y2: number) {
  const dx = (x2 - x1) * 0.55;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// Hexagon path centred at 0,0
function hexPath(r: number) {
  const pts = Array.from({length: 6}, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  });
  return `M ${pts.join(' L ')} Z`;
}

function ago(iso: string) {
  const m = Math.floor((Date.now() - +new Date(iso)) / 60000);
  if (m < 60) {
    return `${m}m ago`;
  }
  if (m < 1440) {
    return `${Math.floor(m / 60)}h ago`;
  }
  return `${Math.floor(m / 1440)}d ago`;
}

// ─── SVG Node components ──────────────────────────────────────────────────────

function CFNSvgNode({
  node,
  pos,
  selected,
  onClick
}: {
  node: CognitionFabricNodeTopology;
  pos: {cx: number; cy: number};
  selected: boolean;
  onClick: () => void;
}) {
  const online = node.status === 'online';
  const color = online ? C.cfnOnline : C.cfnOffline;
  const shortName = node.name.length > 18 ? node.name.slice(0, 18) + '…' : node.name;

  return (
    <g transform={`translate(${pos.cx},${pos.cy})`} style={{cursor: 'pointer'}} onClick={onClick}>
      {online && (
        <circle r={CFN_R + 10} fill="none" stroke={color} strokeWidth="1" opacity="0.15">
          <animate attributeName="r" values={`${CFN_R + 6};${CFN_R + 16};${CFN_R + 6}`} dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.15;0;0.15" dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      {selected && <circle r={CFN_R + 8} fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" strokeDasharray="4 3" />}
      <circle r={CFN_R} fill={selected ? `${color}18` : `${color}0d`} stroke={color} strokeWidth={selected ? 1.8 : 1.2} opacity={online ? 1 : 0.7} />
      <circle r={CFN_R - 10} fill="none" stroke={color} strokeWidth="0.5" opacity="0.3" />
      <text y={-16} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7.5, fill: color, letterSpacing: '0.2em', opacity: 0.8}}>
        CFN
      </text>
      <circle cx={0} cy={-7} r={3.5} fill={color} opacity={online ? 1 : 0.5}>
        {online && <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text y={8} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 8, fill: '#0f1c2e', fontWeight: 500}}>
        {shortName.split('-').slice(0, 2).join('-')}
      </text>
      <text y={20} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7.5, fill: '#0f1c2e'}}>
        {shortName.split('-').slice(2).join('-')}
      </text>
    </g>
  );
}

function CESvgNode({ce, pos, selected, onClick}: {ce: CENode; pos: {cx: number; cy: number}; selected: boolean; onClick: () => void}) {
  const online = ce.status === 'online';
  const color = online ? C.engine : C.cfnOffline;

  return (
    <g transform={`translate(${pos.cx},${pos.cy})`} style={{cursor: 'pointer'}} onClick={onClick}>
      {selected && <circle r={CE_R + 8} fill="none" stroke={color} strokeWidth="1.2" opacity="0.4" strokeDasharray="3 3" />}
      <path d={hexPath(CE_R)} fill={selected ? `${color}18` : `${color}0d`} stroke={color} strokeWidth={selected ? 1.6 : 1} />
      <path d={hexPath(CE_R - 8)} fill="none" stroke={color} strokeWidth="0.4" opacity="0.25" />
      <text y={-11} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7, fill: color, letterSpacing: '0.18em', opacity: 0.8}}>
        CE
      </text>
      <circle cx={0} cy={-3} r={3} fill={color} />
      <text y={9} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7.5, fill: '#0f1c2e'}}>
        {ce.subkind ?? ce.kind ?? '—'}
      </text>
      <text y={20} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7, fill: C.muted}}>
        v{ce.version}
      </text>
    </g>
  );
}

function MPSvgNode({mp, pos, selected, onClick}: {mp: MPNode; pos: {cx: number; cy: number}; selected: boolean; onClick: () => void}) {
  const color = C.memory;
  const d = `M 0,${-MP_R} L ${MP_R},0 L 0,${MP_R} L ${-MP_R},0 Z`;
  const di = MP_R - 7;
  const inner = `M 0,${-di} L ${di},0 L 0,${di} L ${-di},0 Z`;
  const shortName = mp.name.length > 16 ? mp.name.slice(0, 16) + '…' : mp.name;

  return (
    <g transform={`translate(${pos.cx},${pos.cy})`} style={{cursor: 'pointer'}} onClick={onClick}>
      {selected && (
        <path
          d={`M 0,${-(MP_R + 10)} L ${MP_R + 10},0 L 0,${MP_R + 10} L ${-(MP_R + 10)},0 Z`}
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          opacity="0.45"
          strokeDasharray="3 3"
        />
      )}
      <path d={d} fill={selected ? `${color}18` : `${color}0d`} stroke={color} strokeWidth={selected ? 1.5 : 1} opacity={mp.enabled ? 1 : 0.5} />
      <path d={inner} fill="none" stroke={color} strokeWidth="0.4" opacity="0.25" />
      <text y={-11} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7, fill: color, letterSpacing: '0.18em', opacity: 0.8}}>
        MEM
      </text>
      <circle cx={0} cy={-3} r={2.5} fill={color} opacity={mp.enabled ? 0.9 : 0.4} />
      <text y={9} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7.5, fill: '#0f1c2e'}}>
        {shortName.split('-')[0]}
      </text>
      <text y={19} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 7, fill: C.muted}}>
        {shortName.split('-').slice(1).join('-')}
      </text>
    </g>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailRow({label, value}: {label: string; value: string}) {
  return (
    <div className={dtRow}>
      <span className={cn(dtLabel, 'text-xs')}>{label}</span>
      <span className={cn(dtValue, 'text-xs break-all font-mono')}>{value}</span>
    </div>
  );
}

function SectionLabel({children}: {children: React.ReactNode}) {
  return <p className={cn(dtSectionHeader, 'text-xs uppercase tracking-widest mt-4 mb-2 opacity-60')}>{children}</p>;
}

function DetailPanel({
  sel,
  nodes,
  allCEs,
  allMPs,
  onClose
}: {
  sel: NonNullable<Selected>;
  nodes: CognitionFabricNodeTopology[];
  allCEs: CENode[];
  allMPs: MPNode[];
  onClose: () => void;
}) {
  let body: React.ReactNode = null;

  if (sel.kind === 'cfn') {
    const node = nodes.find((n) => n.id === sel.id);
    if (!node) {
      return null;
    }
    const online = node.status === 'online';
    const color = online ? C.cfnOnline : C.cfnOffline;
    body = (
      <>
        <div className="flex items-center gap-2 mb-3">
          <div style={{width: 8, height: 8, borderRadius: '50%', background: color}} />
          <span style={{fontFamily: 'monospace', fontSize: 9, color, letterSpacing: '0.14em'}}>CFN · {node.status.toUpperCase()}</span>
        </div>
        <p className="text-sm font-semibold text-foreground mb-0.5">{node.name}</p>
        <p className="text-xs text-muted-foreground font-mono mb-4 break-all">{node.id}</p>
        <DetailRow label="ip : port" value={node.ip_address ? `${node.ip_address}:${node.port ?? '—'}` : '—'} />
        <DetailRow label="enabled" value={String(node.enabled)} />
        <DetailRow label="last seen" value={`${ago(node.last_seen)}`} />
        <DetailRow label="created" value={new Date(node.created_at).toLocaleDateString()} />
        {(node.workspace_ids ?? []).length > 0 && (
          <>
            <SectionLabel>Workspaces ({node.workspace_ids?.length})</SectionLabel>
            {node.workspace_ids?.map((ws) => (
              <p key={ws} className="text-xs text-muted-foreground font-mono mb-1 break-all">
                {ws}
              </p>
            ))}
          </>
        )}
        {(node.cognition_engines ?? []).length > 0 && (
          <>
            <SectionLabel>Cognition Engines ({node.cognition_engines?.length})</SectionLabel>
            {node.cognition_engines?.map((ce) => (
              <div key={ce.id} className="flex items-center gap-2 mb-1">
                <div
                  style={{width: 6, height: 6, borderRadius: '50%', background: ce.status === 'online' ? C.engine : C.cfnOffline, flexShrink: 0}}
                />
                <span className="text-xs text-foreground font-mono truncate">{ce.name}</span>
                <span className="text-xs text-muted-foreground font-mono ml-auto shrink-0">v{ce.version}</span>
              </div>
            ))}
          </>
        )}
        {(node.memory_providers ?? []).length > 0 && (
          <>
            <SectionLabel>Memory Providers ({node.memory_providers?.length})</SectionLabel>
            {node.memory_providers?.map((mp) => (
              <div key={mp.id} className="flex items-center gap-2 mb-1">
                <div style={{width: 6, height: 6, background: C.memory, transform: 'rotate(45deg)', flexShrink: 0}} />
                <span className="text-xs text-foreground font-mono truncate">{mp.name}</span>
              </div>
            ))}
          </>
        )}
      </>
    );
  }

  if (sel.kind === 'ce') {
    const ce = allCEs.find((e) => e.id === sel.id);
    const parent = nodes.find((n) => n.id === sel.cfnId);
    if (!ce) {
      return null;
    }
    const online = ce.status === 'online';
    body = (
      <>
        <div className="flex items-center gap-2 mb-3">
          <div style={{width: 8, height: 8, background: C.engine, clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)'}} />
          <span style={{fontFamily: 'monospace', fontSize: 9, color: online ? C.engine : C.cfnOffline, letterSpacing: '0.14em'}}>
            CE · {ce.status.toUpperCase()}
          </span>
        </div>
        <p className="text-sm font-semibold text-foreground mb-0.5">{ce.name}</p>
        <p className="text-xs text-muted-foreground font-mono mb-4 break-all">{ce.id}</p>
        <DetailRow label="version" value={ce.version} />
        <DetailRow label="kind" value={ce.kind ?? '—'} />
        <DetailRow label="subkind" value={ce.subkind ?? '—'} />
        <DetailRow label="url" value={ce.url} />
        <DetailRow label="enabled" value={String(ce.enabled)} />
        {ce.last_seen && <DetailRow label="last seen" value={ago(ce.last_seen)} />}
        {parent && (
          <>
            <SectionLabel>Host Node</SectionLabel>
            <p className="text-xs text-foreground font-mono">{parent.name}</p>
            {parent.ip_address && (
              <p className="text-xs text-muted-foreground font-mono">
                {parent.ip_address}:{parent.port}
              </p>
            )}
          </>
        )}
      </>
    );
  }

  if (sel.kind === 'mp') {
    const mp = allMPs.find((m) => m.id === sel.id);
    if (!mp) {
      return null;
    }
    const connectedNodes = nodes.filter((n) => n.memory_providers?.some((m) => m.id === sel.id));
    body = (
      <>
        <div className="flex items-center gap-2 mb-3">
          <div style={{width: 8, height: 8, background: C.memory, transform: 'rotate(45deg)'}} />
          <span style={{fontFamily: 'monospace', fontSize: 9, color: C.memory, letterSpacing: '0.14em'}}>MEMORY PROVIDER</span>
        </div>
        <p className="text-sm font-semibold text-foreground mb-0.5">{mp.name}</p>
        <p className="text-xs text-muted-foreground font-mono mb-4 break-all">{mp.id}</p>
        <DetailRow label="enabled" value={String(mp.enabled)} />
        <DetailRow label="created" value={new Date(mp.created_at).toLocaleDateString()} />
        {mp.description && (
          <>
            <SectionLabel>Description</SectionLabel>
            <p className="text-xs text-muted-foreground leading-relaxed">{mp.description}</p>
          </>
        )}
        {connectedNodes.length > 0 && (
          <>
            <SectionLabel>Connected to {connectedNodes.length} CFN node(s)</SectionLabel>
            {connectedNodes.map((n) => (
              <div key={n.id} className="flex items-center gap-2 mb-1">
                <div
                  style={{width: 6, height: 6, borderRadius: '50%', background: n.status === 'online' ? C.cfnOnline : C.cfnOffline, flexShrink: 0}}
                />
                <span className="text-xs text-foreground font-mono truncate">{n.name}</span>
              </div>
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <motion.div
      initial={{opacity: 0, x: 16}}
      animate={{opacity: 1, x: 0}}
      exit={{opacity: 0, x: 16}}
      transition={{duration: 0.15}}
      className="w-72 shrink-0 h-full border-l border-border bg-card flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
        <span className="text-xs font-mono text-muted-foreground tracking-widest uppercase">Inspect</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{body}</div>
    </motion.div>
  );
}

// ─── Count badge ──────────────────────────────────────────────────────────────

function CountBadge({label, total, up, down, color}: {label: string; total: number; up?: number; down?: number; color: string}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-bold text-foreground leading-none">{total}</span>
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
      </div>
      {(up !== undefined || down !== undefined) && (
        <div className="flex gap-2">
          {up !== undefined && (
            <span className="font-mono text-xs" style={{color: C.cfnOnline}}>
              {up} up
            </span>
          )}
          {down !== undefined && (
            <span className="font-mono text-xs" style={{color: C.cfnOffline}}>
              {down} down
            </span>
          )}
        </div>
      )}
      {up === undefined && down === undefined && (
        <span className="font-mono text-xs opacity-60" style={{color}}>
          global
        </span>
      )}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function LegendDot({color, shape}: {color: string; shape: 'circle' | 'hex' | 'diamond'}) {
  return (
    <svg width="12" height="12" viewBox="-6 -6 12 12">
      {shape === 'circle' && <circle r="5" fill={`${color}22`} stroke={color} strokeWidth="1" />}
      {shape === 'hex' && <path d={hexPath(5)} fill={`${color}22`} stroke={color} strokeWidth="1" />}
      {shape === 'diamond' && <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill={`${color}22`} stroke={color} strokeWidth="1" />}
    </svg>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface CfnTopologyProps {
  nodes: CognitionFabricNodeTopology[];
}

export function CfnTopology({nodes}: CfnTopologyProps) {
  const [sel, setSel] = useState<Selected>(null);

  const {allCEs, allMPs, cfnPos, cePos, mpPos, H} = computeLayout(nodes);
  const edges = buildEdges(nodes, cfnPos, cePos, mpPos);

  const onlineCFNs = nodes.filter((n) => n.status === 'online').length;
  const onlineCEs = allCEs.filter((ce) => ce.status === 'online').length;

  function selectCFN(node: CognitionFabricNodeTopology) {
    const ceIds = (node.cognition_engines ?? []).map((ce) => ce.id);
    setSel((prev) => (prev?.kind === 'cfn' && prev.id === node.id ? null : {kind: 'cfn', id: node.id, ceIds}));
  }

  function selectCE(ce: CENode) {
    setSel((prev) => (prev?.kind === 'ce' && prev.id === ce.id ? null : {kind: 'ce', id: ce.id, cfnId: ce.cfnId}));
  }

  function selectMP(mp: MPNode) {
    setSel((prev) => (prev?.kind === 'mp' && prev.id === mp.id ? null : {kind: 'mp', id: mp.id}));
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-[#f0f4f8] dark:bg-muted">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="3" fill={C.cfnOnline} />
            <circle cx="3" cy="5" r="1.8" fill={C.cfnOnline} opacity="0.5" />
            <circle cx="17" cy="5" r="1.8" fill={C.cfnOnline} opacity="0.5" />
            <circle cx="3" cy="15" r="1.8" fill={C.cfnOnline} opacity="0.5" />
            <circle cx="17" cy="15" r="1.8" fill={C.cfnOnline} opacity="0.5" />
            <line x1="10" y1="10" x2="3" y2="5" stroke={C.cfnOnline} strokeWidth="0.8" opacity="0.35" />
            <line x1="10" y1="10" x2="17" y2="5" stroke={C.cfnOnline} strokeWidth="0.8" opacity="0.35" />
            <line x1="10" y1="10" x2="3" y2="15" stroke={C.cfnOnline} strokeWidth="0.8" opacity="0.35" />
            <line x1="10" y1="10" x2="17" y2="15" stroke={C.cfnOnline} strokeWidth="0.8" opacity="0.35" />
          </svg>
          <span className="font-mono text-xs font-semibold text-foreground tracking-wider">Cognition Fabric</span>
          <span className="font-mono text-xs text-muted-foreground">/ topology</span>
        </div>
        <div className="flex items-center gap-6">
          <CountBadge label="CFN Nodes" total={nodes.length} up={onlineCFNs} down={nodes.length - onlineCFNs} color={C.cfnOnline} />
          <div className="w-px h-7 bg-border" />
          <CountBadge label="Engines" total={allCEs.length} up={onlineCEs} down={allCEs.length - onlineCEs} color={C.engine} />
          <div className="w-px h-7 bg-border" />
          <CountBadge label="Mem Providers" total={allMPs.length} color={C.memory} />
        </div>
      </div>

      {/* Canvas + Detail panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* SVG canvas */}
        <div className="flex-1 overflow-auto flex items-center justify-center relative" onClick={() => setSel(null)}>
          {/* Dot grid */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25">
            <defs>
              <pattern id="cfn-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.9" fill="rgba(0,80,160,0.18)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cfn-grid)" />
          </svg>

          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{flexShrink: 0, overflow: 'visible'}} onClick={(e) => e.stopPropagation()}>
            <defs>
              <filter id="cfn-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker id="arr-on" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.edgeOnline} />
              </marker>
              <marker id="arr-off" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.edgeOffline} />
              </marker>
              <marker id="arr-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.cfnOnline} />
              </marker>
            </defs>

            {/* Column labels */}
            {[
              {x: 50, label: 'CFN NODES'},
              {x: 350, label: 'COGNITION ENGINES'},
              {x: 658, label: 'MEMORY PROVIDERS'}
            ].map(({x, label}) => (
              <text key={label} x={x} y={30} style={{fontFamily: 'monospace', fontSize: 8, fill: 'rgba(0,80,160,0.35)', letterSpacing: '0.2em'}}>
                {label}
              </text>
            ))}

            {/* Column dividers */}
            {[320, 620].map((x) => (
              <line key={x} x1={x} y1={44} x2={x} y2={H - 20} stroke="rgba(0,80,160,0.07)" strokeWidth="1" strokeDasharray="4 8" />
            ))}

            {/* Edges */}
            {edges.map((edge) => {
              const active = isEdgeActive(edge, sel);
              return (
                <path
                  key={edge.id}
                  d={bez(edge.x1, edge.y1, edge.x2, edge.y2)}
                  fill="none"
                  stroke={active ? C.edgeActive : edge.online ? C.edgeOnline : C.edgeOffline}
                  strokeWidth={active ? 1.8 : 1}
                  strokeDasharray={!edge.online ? '5 5' : undefined}
                  markerEnd={active ? 'url(#arr-active)' : edge.online ? 'url(#arr-on)' : 'url(#arr-off)'}
                  filter={active ? 'url(#cfn-glow)' : undefined}
                  style={{transition: 'stroke 0.2s, stroke-width 0.2s'}}
                />
              );
            })}

            {/* CFN Nodes */}
            {nodes.map((node) => {
              const pos = cfnPos.get(node.id);
              if (!pos) {
                return null;
              }
              return (
                <CFNSvgNode
                  key={node.id}
                  node={node}
                  pos={pos}
                  selected={sel?.kind === 'cfn' && sel.id === node.id}
                  onClick={() => selectCFN(node)}
                />
              );
            })}

            {/* CE Nodes */}
            {allCEs.map((ce) => {
              const pos = cePos.get(ce.id);
              if (!pos) {
                return null;
              }
              return <CESvgNode key={ce.id} ce={ce} pos={pos} selected={sel?.kind === 'ce' && sel.id === ce.id} onClick={() => selectCE(ce)} />;
            })}

            {/* Memory Provider Nodes */}
            {allMPs.map((mp) => {
              const pos = mpPos.get(mp.id);
              if (!pos) {
                return null;
              }
              return <MPSvgNode key={mp.id} mp={mp} pos={pos} selected={sel?.kind === 'mp' && sel.id === mp.id} onClick={() => selectMP(mp)} />;
            })}
          </svg>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {sel && <DetailPanel key={`${sel.kind}-${sel.id}`} sel={sel} nodes={nodes} allCEs={allCEs} allMPs={allMPs} onClose={() => setSel(null)} />}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-5 py-2.5 border-t border-border bg-card shrink-0">
        <div className="flex items-center gap-1.5">
          <LegendDot color={C.cfnOnline} shape="circle" />
          <span className="font-mono text-xs text-muted-foreground">CFN Node</span>
        </div>
        <div className="flex items-center gap-1.5">
          <LegendDot color={C.engine} shape="hex" />
          <span className="font-mono text-xs text-muted-foreground">Cognition Engine</span>
        </div>
        <div className="flex items-center gap-1.5">
          <LegendDot color={C.memory} shape="diamond" />
          <span className="font-mono text-xs text-muted-foreground">Memory Provider</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6">
              <line x1="0" y1="3" x2="20" y2="3" stroke={C.edgeOnline} strokeWidth="1.5" />
              <path d="M16,0 L20,3 L16,6" fill={C.edgeOnline} />
            </svg>
            <span className="font-mono text-xs text-muted-foreground">Online</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6">
              <line x1="0" y1="3" x2="20" y2="3" stroke={C.edgeOffline} strokeWidth="1.5" strokeDasharray="4 3" />
              <path d="M16,0 L20,3 L16,6" fill={C.edgeOffline} />
            </svg>
            <span className="font-mono text-xs text-muted-foreground">Offline</span>
          </div>
          <span className="font-mono text-xs text-muted-foreground opacity-60">click node to inspect · click canvas to deselect</span>
        </div>
      </div>
    </div>
  );
}
