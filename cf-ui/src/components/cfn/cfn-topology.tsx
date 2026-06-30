// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {X, ArrowUpRight} from 'lucide-react';
import Link from 'next/link';
import type {CognitionFabricNodeTopology, MemoryProviderListItem} from '@/api/endpoints/cfn';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';
import {routes} from '@/constants/routes';

const W = 1200;
const CFN_R = 72;
const CE_R = 64;
const MP_R = 60;
const COLS = {ce: 170, cfn: 590, mem: 1010};
const PADDING_TOP = 90;
const NODE_GAP = 210;
const MP_ZONE_X = 800;

const C = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#21262d',
  cfnOnline: '#22c55e',
  cfnOffline: '#f97316',
  engine: '#38bdf8',
  memory: '#a855f7',
  edgeCeOnline: 'rgba(34,197,94,0.55)',
  edgeCeOffline: 'rgba(249,115,22,0.55)',
  edgeCeActive: '#22c55e',
  edgeMp: 'rgba(168,85,247,0.45)',
  edgeMpOffline: 'rgba(249,115,22,0.35)',
  edgeMpActive: '#a855f7',
  text: '#e6edf3',
  textSub: '#8b949e',
  textDim: '#484f58',
  gridDot: 'rgba(255,255,255,0.04)'
};

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
  type: 'cfn-ce' | 'cfn-mp';
  cfnId?: string;
  ceId?: string;
  mpId?: string;
};

function computeLayout(nodes: CognitionFabricNodeTopology[]) {
  const ceMap = new Map<string, CENode>();
  const mpMap = new Map<string, MPNode>();

  for (const node of nodes) {
    for (const ce of node.cognition_engines ?? []) {
      if (!ceMap.has(ce.id)) ceMap.set(ce.id, {...ce, cfnId: node.id});
    }
    for (const mp of node.memory_providers ?? []) {
      if (!mpMap.has(mp.id)) mpMap.set(mp.id, mp);
    }
  }

  const allCEs = Array.from(ceMap.values());
  const allMPs = Array.from(mpMap.values());
  const rows = Math.max(nodes.length, allCEs.length, allMPs.length, 1);
  const H = Math.max(420, PADDING_TOP + rows * NODE_GAP + 80);

  const cfnStartY = H / 2 - ((nodes.length - 1) * NODE_GAP) / 2;
  const cfnPos = new Map(nodes.map((n, i) => [n.id, {cx: COLS.cfn, cy: cfnStartY + i * NODE_GAP}]));
  const cePos = new Map(allCEs.map((ce, i) => [ce.id, {cx: COLS.ce, cy: PADDING_TOP + i * NODE_GAP + NODE_GAP / 2}]));
  const mpPos = new Map(allMPs.map((mp, i) => [mp.id, {cx: COLS.mem, cy: PADDING_TOP + i * NODE_GAP + NODE_GAP / 2}]));

  const cfnYs = nodes.map((_, i) => cfnStartY + i * NODE_GAP);
  const fabricCy = cfnYs.length ? (cfnYs[0] + cfnYs[cfnYs.length - 1]) / 2 : H / 2;
  const fabricRy = cfnYs.length > 1 ? (cfnYs[cfnYs.length - 1] - cfnYs[0]) / 2 + CFN_R + 48 : CFN_R + 60;
  const fabricRx = CFN_R + 80;

  return {allCEs, allMPs, cfnPos, cePos, mpPos, H, fabricCy, fabricRx, fabricRy};
}

function buildEdges(
  nodes: CognitionFabricNodeTopology[],
  cfnPos: Map<string, {cx: number; cy: number}>,
  cePos: Map<string, {cx: number; cy: number}>,
  mpPos: Map<string, {cx: number; cy: number}>
): Edge[] {
  const edges: Edge[] = [];
  const seenCfnMp = new Set<string>();

  for (const node of nodes) {
    const cp = cfnPos.get(node.id);
    if (!cp) continue;

    for (const ce of node.cognition_engines ?? []) {
      const ep = cePos.get(ce.id);
      if (!ep) continue;
      edges.push({
        id: `cfn-ce-${node.id}-${ce.id}`,
        x1: cp.cx - CFN_R,
        y1: cp.cy,
        x2: ep.cx + CE_R,
        y2: ep.cy,
        online: node.status === 'online' && ce.status === 'online',
        type: 'cfn-ce',
        cfnId: node.id,
        ceId: ce.id
      });
    }

    for (const mp of node.memory_providers ?? []) {
      const mpp = mpPos.get(mp.id);
      if (!mpp) continue;
      const key = `${node.id}-${mp.id}`;
      if (seenCfnMp.has(key)) continue;
      seenCfnMp.add(key);
      edges.push({
        id: `cfn-mp-${node.id}-${mp.id}`,
        x1: cp.cx + CFN_R,
        y1: cp.cy,
        x2: mpp.cx - MP_R,
        y2: mpp.cy,
        online: node.status === 'online' && mp.enabled,
        type: 'cfn-mp',
        cfnId: node.id,
        mpId: mp.id
      });
    }
  }

  return edges;
}

function isEdgeActive(edge: Edge, sel: Selected): boolean {
  if (!sel) return false;
  if (sel.kind === 'cfn') return edge.cfnId === sel.id;
  if (sel.kind === 'ce') return edge.type === 'cfn-ce' && edge.ceId === sel.id;
  if (sel.kind === 'mp') return edge.type === 'cfn-mp' && edge.mpId === sel.id;
  return false;
}

function bezLeft(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
}

function bezRight(x1: number, y1: number, x2: number, y2: number) {
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function hexPath(r: number) {
  const pts = Array.from({length: 6}, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  });
  return `M ${pts.join(' L ')} Z`;
}

function ago(iso: string) {
  const m = Math.floor((Date.now() - +new Date(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function splitName(name: string, maxLen: number): [string, string] {
  if (name.length <= maxLen) return [name, ''];
  const breakAt = Math.max(name.lastIndexOf(' ', maxLen), name.lastIndexOf('-', maxLen));
  if (breakAt > 0) {
    const line1 = name.slice(0, breakAt);
    const rest = name.slice(breakAt + 1);
    const line2 = rest.length > maxLen ? rest.slice(0, maxLen - 1) + '…' : rest;
    return [line1, line2];
  }
  return [name.slice(0, maxLen), name.slice(maxLen, maxLen * 2 - 1) + (name.length > maxLen * 2 - 1 ? '…' : '')];
}

function CFNSvgNode({node, pos, selected, onClick}: {node: CognitionFabricNodeTopology; pos: {cx: number; cy: number}; selected: boolean; onClick: () => void}) {
  const online = node.status === 'online';
  const color = online ? C.cfnOnline : C.cfnOffline;
  const clipped = node.name.length > 32 ? node.name.slice(0, 32) + '…' : node.name;
  const [line1, line2] = splitName(clipped, 16);

  return (
    <g transform={`translate(${pos.cx},${pos.cy})`} style={{cursor: 'pointer'}} onClick={onClick}>
      {online && (
        <circle r={CFN_R + 12} fill="none" stroke={color} strokeWidth="1" opacity="0.15">
          <animate attributeName="r" values={`${CFN_R + 8};${CFN_R + 18};${CFN_R + 8}`} dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.15;0;0.15" dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      {selected && <circle r={CFN_R + 9} fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" strokeDasharray="4 3" />}
      <circle r={CFN_R} fill={selected ? `${color}20` : `${color}0e`} stroke={color} strokeWidth={selected ? 2.5 : 2} />
      <circle r={CFN_R - 10} fill="none" stroke={color} strokeWidth="0.5" opacity="0.2" />
      <text y={-44} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 9, fill: color, letterSpacing: '0.22em', fontWeight: 700}}>
        CFN
      </text>
      <circle cx={0} cy={-28} r={4.5} fill={color} opacity={online ? 1 : 0.5}>
        {online && <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text y={line2 ? -6 : 6} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 13, fill: C.text, fontWeight: 600}}>
        {line1}
      </text>
      {line2 && (
        <text y={12} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 12, fill: C.text}}>
          {line2}
        </text>
      )}
    </g>
  );
}

function CESvgNode({ce, pos, selected, onClick}: {ce: CENode; pos: {cx: number; cy: number}; selected: boolean; onClick: () => void}) {
  const online = ce.status === 'online';
  const color = online ? C.engine : C.cfnOffline;
  const clipped = ce.name.length > 24 ? ce.name.slice(0, 24) + '…' : ce.name;
  const [line1, line2] = splitName(clipped, 14);
  const nameBottomY = line2 ? 10 : 2;

  return (
    <g transform={`translate(${pos.cx},${pos.cy})`} style={{cursor: 'pointer'}} onClick={onClick}>
      {selected && <circle r={CE_R + 8} fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" strokeDasharray="3 3" />}
      <path d={hexPath(CE_R)} fill={selected ? `${color}20` : `${color}0e`} stroke={color} strokeWidth={selected ? 2.2 : 1.8} />
      <path d={hexPath(CE_R - 10)} fill="none" stroke={color} strokeWidth="0.4" opacity="0.2" />
      <text y={-42} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 9, fill: color, letterSpacing: '0.2em', fontWeight: 700}}>
        CE
      </text>
      <circle cx={0} cy={-28} r={4} fill={color} opacity={online ? 1 : 0.5} />
      <text y={line2 ? -8 : 0} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 12, fill: C.text, fontWeight: 600}}>
        {line1}
      </text>
      {line2 && (
        <text y={10} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 11, fill: C.text}}>
          {line2}
        </text>
      )}
      <line x1={-24} y1={nameBottomY + 10} x2={24} y2={nameBottomY + 10} stroke={color} strokeWidth="0.5" opacity="0.35" />
      <text y={nameBottomY + 24} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 10, fill: C.textSub}}>
        v{ce.version}
      </text>
    </g>
  );
}

function MPSvgNode({mp, pos, selected, onClick}: {mp: MPNode; pos: {cx: number; cy: number}; selected: boolean; onClick: () => void}) {
  const color = C.memory;
  const d = `M 0,${-MP_R} L ${MP_R},0 L 0,${MP_R} L ${-MP_R},0 Z`;
  const di = MP_R - 10;
  const inner = `M 0,${-di} L ${di},0 L 0,${di} L ${-di},0 Z`;
  const clipped = mp.name.length > 24 ? mp.name.slice(0, 24) + '…' : mp.name;
  const [line1, line2] = splitName(clipped, 12);

  return (
    <g transform={`translate(${pos.cx},${pos.cy})`} style={{cursor: 'pointer'}} onClick={onClick}>
      {selected && (
        <path
          d={`M 0,${-(MP_R + 10)} L ${MP_R + 10},0 L 0,${MP_R + 10} L ${-(MP_R + 10)},0 Z`}
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          opacity="0.5"
          strokeDasharray="3 3"
        />
      )}
      <path d={d} fill={selected ? `${color}20` : `${color}0e`} stroke={color} strokeWidth={selected ? 2.2 : 1.8} opacity={mp.enabled ? 1 : 0.5} />
      <path d={inner} fill="none" stroke={color} strokeWidth="0.4" opacity="0.2" />
      <text y={-38} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 9, fill: color, letterSpacing: '0.2em', fontWeight: 700}}>
        MEM
      </text>
      <circle cx={0} cy={-24} r={4.5} fill={color} opacity={mp.enabled ? 0.9 : 0.4} />
      <text y={line2 ? -2 : 7} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 13, fill: C.text, fontWeight: 600}}>
        {line1}
      </text>
      {line2 && (
        <text y={17} textAnchor="middle" style={{fontFamily: 'monospace', fontSize: 12, fill: C.text}}>
          {line2}
        </text>
      )}
    </g>
  );
}

function DetailRow({label, value}: {label: string; value: string}) {
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.border}`}}>
      <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub, flexShrink: 0}}>{label}</span>
      <span style={{fontFamily: 'monospace', fontSize: 11, color: C.text, wordBreak: 'break-all', textAlign: 'right'}}>{value}</span>
    </div>
  );
}

function SectionLabel({children}: {children: React.ReactNode}) {
  return (
    <p style={{fontFamily: 'monospace', fontSize: 9, color: C.textSub, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 16, marginBottom: 8}}>
      {children}
    </p>
  );
}

function DetailPanel({sel, nodes, allCEs, allMPs, onClose}: {sel: NonNullable<Selected>; nodes: CognitionFabricNodeTopology[]; allCEs: CENode[]; allMPs: MPNode[]; onClose: () => void}) {
  let body: React.ReactNode = null;

  if (sel.kind === 'cfn') {
    const node = nodes.find((n) => n.id === sel.id);
    if (!node) return null;
    const online = node.status === 'online';
    const color = online ? C.cfnOnline : C.cfnOffline;
    body = (
      <>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
          <div style={{width: 8, height: 8, borderRadius: '50%', background: color}} />
          <span style={{fontFamily: 'monospace', fontSize: 9, color, letterSpacing: '0.14em'}}>CFN · {node.status.toUpperCase()}</span>
        </div>
        <p style={{fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2}}>{node.name}</p>
        <p style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub, wordBreak: 'break-all', marginBottom: 16}}>{node.id}</p>
        <DetailRow label="ip : port" value={node.ip_address ? `${node.ip_address}:${node.port ?? '—'}` : '—'} />
        <DetailRow label="enabled" value={String(node.enabled)} />
        <DetailRow label="last seen" value={ago(node.last_seen)} />
        <DetailRow label="created" value={new Date(node.created_at).toLocaleDateString()} />
        {(node.workspace_ids ?? []).length > 0 && (
          <>
            <SectionLabel>Workspaces ({node.workspace_ids?.length})</SectionLabel>
            {node.workspace_ids?.map((ws) => (
              <p key={ws} style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub, wordBreak: 'break-all', marginBottom: 4}}>{ws}</p>
            ))}
          </>
        )}
        {(node.cognition_engines ?? []).length > 0 && (
          <>
            <SectionLabel>Cognition Engines ({node.cognition_engines?.length})</SectionLabel>
            {node.cognition_engines?.map((ce) => (
              <div key={ce.id} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <div style={{width: 6, height: 6, borderRadius: '50%', background: ce.status === 'online' ? C.engine : C.cfnOffline, flexShrink: 0}} />
                <span style={{fontFamily: 'monospace', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{ce.name}</span>
                <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub, marginLeft: 'auto', flexShrink: 0}}>v{ce.version}</span>
              </div>
            ))}
          </>
        )}
        {(node.memory_providers ?? []).length > 0 && (
          <>
            <SectionLabel>Memory Providers ({node.memory_providers?.length})</SectionLabel>
            {node.memory_providers?.map((mp) => (
              <div key={mp.id} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <div style={{width: 6, height: 6, background: C.memory, transform: 'rotate(45deg)', flexShrink: 0}} />
                <span style={{fontFamily: 'monospace', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{mp.name}</span>
              </div>
            ))}
          </>
        )}
        <Link
          href={routes.cfn.details(node.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 24,
            padding: '10px 16px',
            borderRadius: 6,
            border: `1px solid ${C.cfnOnline}`,
            background: `${C.cfnOnline}18`,
            color: C.cfnOnline,
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            letterSpacing: '0.04em',
            transition: 'background 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${C.cfnOnline}30`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${C.cfnOnline}18`; }}
        >
          View Node Details
          <ArrowUpRight size={13} />
        </Link>
      </>
    );
  }

  if (sel.kind === 'ce') {
    const ce = allCEs.find((e) => e.id === sel.id);
    const parent = nodes.find((n) => n.id === sel.cfnId);
    if (!ce) return null;
    const online = ce.status === 'online';
    body = (
      <>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
          <div style={{width: 8, height: 8, background: C.engine, clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)'}} />
          <span style={{fontFamily: 'monospace', fontSize: 9, color: online ? C.engine : C.cfnOffline, letterSpacing: '0.14em'}}>CE · {ce.status.toUpperCase()}</span>
        </div>
        <p style={{fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2}}>{ce.name}</p>
        <p style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub, wordBreak: 'break-all', marginBottom: 16}}>{ce.id}</p>
        <DetailRow label="version" value={ce.version} />
        <DetailRow label="kind" value={ce.kind ?? '—'} />
        <DetailRow label="subkind" value={ce.subkind ?? '—'} />
        <DetailRow label="url" value={ce.url} />
        <DetailRow label="enabled" value={String(ce.enabled)} />
        {ce.last_seen && <DetailRow label="last seen" value={ago(ce.last_seen)} />}
        {parent && (
          <>
            <SectionLabel>Host Node</SectionLabel>
            <p style={{fontFamily: 'monospace', fontSize: 11, color: C.text}}>{parent.name}</p>
            {parent.ip_address && (
              <p style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub}}>{parent.ip_address}:{parent.port}</p>
            )}
          </>
        )}
      </>
    );
  }

  if (sel.kind === 'mp') {
    const mp = allMPs.find((m) => m.id === sel.id);
    if (!mp) return null;
    const connectedNodes = nodes.filter((n) => n.memory_providers?.some((m) => m.id === sel.id));
    body = (
      <>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
          <div style={{width: 8, height: 8, background: C.memory, transform: 'rotate(45deg)'}} />
          <span style={{fontFamily: 'monospace', fontSize: 9, color: C.memory, letterSpacing: '0.14em'}}>MEMORY PROVIDER · GLOBAL</span>
        </div>
        <p style={{fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2}}>{mp.name}</p>
        <p style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub, wordBreak: 'break-all', marginBottom: 16}}>{mp.id}</p>
        <DetailRow label="enabled" value={String(mp.enabled)} />
        <DetailRow label="created" value={new Date(mp.created_at).toLocaleDateString()} />
        {mp.description && (
          <>
            <SectionLabel>Description</SectionLabel>
            <p style={{fontSize: 12, color: C.textSub, lineHeight: 1.5}}>{mp.description}</p>
          </>
        )}
        {connectedNodes.length > 0 && (
          <>
            <SectionLabel>Connected CFN Nodes ({connectedNodes.length})</SectionLabel>
            {connectedNodes.map((n) => (
              <div key={n.id} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <div style={{width: 6, height: 6, borderRadius: '50%', background: n.status === 'online' ? C.cfnOnline : C.cfnOffline, flexShrink: 0}} />
                <span style={{fontFamily: 'monospace', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{n.name}</span>
              </div>
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <motion.div
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      transition={{duration: 0.15}}
      style={{width: 288, flexShrink: 0, height: '100%', borderLeft: `1px solid ${C.border}`, background: C.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}
    >
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${C.border}`}}>
        <span style={{fontFamily: 'monospace', fontSize: 10, color: C.textSub, letterSpacing: '0.15em', textTransform: 'uppercase'}}>Inspect</span>
        <button onClick={onClose} style={{color: C.textSub, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center'}}>
          <X size={14} />
        </button>
      </div>
      <div style={{flex: 1, overflowY: 'auto', padding: 16}}>{body}</div>
    </motion.div>
  );
}

function CountBadge({label, total, up, down, color}: {label: string; total: number; up?: number; down?: number; color: string}) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2}}>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 6}}>
        <span style={{fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1}}>{total}</span>
        <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub}}>{label}</span>
      </div>
      {(up !== undefined || down !== undefined) && (
        <div style={{display: 'flex', gap: 8}}>
          {up !== undefined && <span style={{fontFamily: 'monospace', fontSize: 11, color: C.cfnOnline}}>{up} up</span>}
          {down !== undefined && <span style={{fontFamily: 'monospace', fontSize: 11, color: C.cfnOffline}}>{down} down</span>}
        </div>
      )}
      {up === undefined && down === undefined && (
        <span style={{fontFamily: 'monospace', fontSize: 11, color, opacity: 0.6}}>global</span>
      )}
    </div>
  );
}

interface CfnTopologyProps {
  nodes: CognitionFabricNodeTopology[];
}

export function CfnTopology({nodes}: CfnTopologyProps) {
  const [sel, setSel] = useState<Selected>(null);

  const {allCEs, allMPs, cfnPos, cePos, mpPos, H, fabricCy, fabricRx, fabricRy} = computeLayout(nodes);
  const edges = buildEdges(nodes, cfnPos, cePos, mpPos);

  const cfnCeEdges = edges.filter((e) => e.type === 'cfn-ce');
  const cfnMpEdges = edges.filter((e) => e.type === 'cfn-mp');

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
    <div style={{display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden'}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <svg width="16" height="16" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="3" fill={C.cfnOnline} />
            {([[3,5],[17,5],[3,15],[17,15]] as [number,number][]).map(([x,y],i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="1.8" fill={C.cfnOnline} opacity="0.5" />
                <line x1="10" y1="10" x2={x} y2={y} stroke={C.cfnOnline} strokeWidth="0.8" opacity="0.3" />
              </g>
            ))}
          </svg>
          <span style={{fontFamily: 'monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: C.text}}>FABRIC TOPOLOGY</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 24}}>
          <CountBadge label="CFN Nodes" total={nodes.length} up={onlineCFNs} down={nodes.length - onlineCFNs} color={C.cfnOnline} />
          <div style={{width: 1, height: 28, background: C.border}} />
          <CountBadge label="Cognition Engines" total={allCEs.length} up={onlineCEs} down={allCEs.length - onlineCEs} color={C.engine} />
          <div style={{width: 1, height: 28, background: C.border}} />
          <CountBadge label="Mem Providers" total={allMPs.length} color={C.memory} />
        </div>
      </div>

      <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
        <div style={{position: 'absolute', inset: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setSel(null)}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <pattern id="cfn-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.9" fill={C.gridDot} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cfn-grid)" />
          </svg>

          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{flexShrink: 0, overflow: 'visible'}} onClick={(e) => e.stopPropagation()}>
            <defs>
              <filter id="glow-green" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-purple" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <marker id="arr-ce-on" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.edgeCeOnline} />
              </marker>
              <marker id="arr-ce-off" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.edgeCeOffline} />
              </marker>
              <marker id="arr-ce-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.cfnOnline} />
              </marker>
              <marker id="arr-mp" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.edgeMp} />
              </marker>
              <marker id="arr-mp-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.memory} />
              </marker>
            </defs>

            <ellipse
              cx={COLS.cfn}
              cy={fabricCy}
              rx={fabricRx}
              ry={fabricRy}
              fill="none"
              stroke="rgba(34,197,94,0.12)"
              strokeWidth="1"
              strokeDasharray="6 5"
            />
            <text
              x={COLS.cfn - fabricRx + 8}
              y={fabricCy - fabricRy + 14}
              style={{fontFamily: 'monospace', fontSize: 8, fill: 'rgba(34,197,94,0.3)', letterSpacing: '0.25em'}}
            >
              COGNITION FABRIC
            </text>

            <rect x={MP_ZONE_X} y={44} width={W - MP_ZONE_X + 20} height={H - 54} fill="rgba(168,85,247,0.04)" rx="6" />

            {[
              {x: 60, label: 'COGNITION ENGINES', color: 'rgba(56,189,248,0.4)'},
              {x: MP_ZONE_X + 10, label: 'SHARED MEMORY', color: 'rgba(168,85,247,0.4)'}
            ].map(({x, label, color}) => (
              <text key={label} x={x} y={34} style={{fontFamily: 'monospace', fontSize: 8, fill: color, letterSpacing: '0.2em'}}>
                {label}
              </text>
            ))}

            {cfnMpEdges.map((edge) => {
              const active = isEdgeActive(edge, sel);
              return (
                <path
                  key={edge.id}
                  d={bezRight(edge.x1, edge.y1, edge.x2, edge.y2)}
                  fill="none"
                  stroke={active ? C.edgeMpActive : edge.online ? C.edgeMp : C.edgeMpOffline}
                  strokeWidth={active ? 2 : 1.5}
                  strokeDasharray={!edge.online ? '6 4' : undefined}
                  markerEnd={active ? 'url(#arr-mp-active)' : 'url(#arr-mp)'}
                  filter={active ? 'url(#glow-purple)' : undefined}
                  style={{transition: 'stroke 0.2s, stroke-width 0.2s'}}
                />
              );
            })}

            {cfnCeEdges.map((edge) => {
              const active = isEdgeActive(edge, sel);
              return (
                <path
                  key={edge.id}
                  d={bezLeft(edge.x1, edge.y1, edge.x2, edge.y2)}
                  fill="none"
                  stroke={active ? C.edgeCeActive : edge.online ? C.edgeCeOnline : C.edgeCeOffline}
                  strokeWidth={active ? 2 : 1.5}
                  strokeDasharray={!edge.online ? '6 4' : undefined}
                  markerEnd={active ? 'url(#arr-ce-active)' : edge.online ? 'url(#arr-ce-on)' : 'url(#arr-ce-off)'}
                  filter={active ? 'url(#glow-green)' : undefined}
                  style={{transition: 'stroke 0.2s, stroke-width 0.2s'}}
                />
              );
            })}

            {allCEs.map((ce) => {
              const pos = cePos.get(ce.id);
              if (!pos) return null;
              return <CESvgNode key={ce.id} ce={ce} pos={pos} selected={sel?.kind === 'ce' && sel.id === ce.id} onClick={() => selectCE(ce)} />;
            })}

            {nodes.map((node) => {
              const pos = cfnPos.get(node.id);
              if (!pos) return null;
              return <CFNSvgNode key={node.id} node={node} pos={pos} selected={sel?.kind === 'cfn' && sel.id === node.id} onClick={() => selectCFN(node)} />;
            })}

            {allMPs.map((mp) => {
              const pos = mpPos.get(mp.id);
              if (!pos) return null;
              return <MPSvgNode key={mp.id} mp={mp} pos={pos} selected={sel?.kind === 'mp' && sel.id === mp.id} onClick={() => selectMP(mp)} />;
            })}
          </svg>
        </div>

        <AnimatePresence>
          {sel && (
            <div style={{position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 10}}>
              <DetailPanel key={`${sel.kind}-${sel.id}`} sel={sel} nodes={nodes} allCEs={allCEs} allMPs={allMPs} onClose={() => setSel(null)} />
            </div>
          )}
        </AnimatePresence>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: 20, padding: '10px 20px', background: C.surface, borderTop: `1px solid ${C.border}`, flexShrink: 0}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <div style={{width: 8, height: 8, borderRadius: '50%', background: C.cfnOnline}} />
          <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub}}>online</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <div style={{width: 8, height: 8, borderRadius: '50%', background: C.cfnOffline}} />
          <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub}}>offline</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <svg width="12" height="12" viewBox="-6 -6 12 12">
            <path d={hexPath(5)} fill={`${C.engine}22`} stroke={C.engine} strokeWidth="1" />
          </svg>
          <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub}}>cognition engine</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <svg width="12" height="12" viewBox="-6 -6 12 12">
            <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill={`${C.memory}22`} stroke={C.memory} strokeWidth="1" />
          </svg>
          <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub}}>memory provider (global)</span>
        </div>
        <span style={{fontFamily: 'monospace', fontSize: 11, color: C.textDim, marginLeft: 'auto'}}>click node to inspect · click canvas to deselect</span>
      </div>
    </div>
  );
}
