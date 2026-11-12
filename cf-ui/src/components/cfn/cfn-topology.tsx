// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useState, useMemo, useRef, useCallback, useEffect} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {X, ArrowUpRight, Copy, Check, Plus, Minus, Maximize2, Network} from 'lucide-react';
import Link from 'next/link';
import type {CognitionFabricNodeTopology} from '@/api/endpoints/cfn';
import {routes} from '@/constants/routes';
import {topologyColors as C} from '@/components/ui/topology-colors';
import {formatRelativeTimestamp, formatTimestamp} from '@/lib/utils';

const W = 1200;
const H = 700;
const NODE_R = 76;
const HUB_R = 20;
const HUB_X = W / 2;
const HUB_Y = H / 2;

type Selected = {id: string} | null;

function splitName(name: string, maxLen: number): [string, string] {
  if (name.length <= maxLen) {
    return [name, ''];
  }
  const breakAt = Math.max(name.lastIndexOf(' ', maxLen), name.lastIndexOf('-', maxLen));
  const cut = breakAt > 0 ? breakAt : maxLen;
  const line1 = name.slice(0, cut);
  const rest = name.slice(breakAt > 0 ? cut + 1 : cut);
  if (rest.length <= maxLen) {
    return [line1, rest];
  }
  const breakAt2 = Math.max(rest.lastIndexOf(' ', maxLen - 1), rest.lastIndexOf('-', maxLen - 1));
  if (breakAt2 > 0) {
    return [line1, rest.slice(0, breakAt2) + '…'];
  }
  return [line1, rest.slice(0, maxLen - 1) + '…'];
}

function PanelId({value}: {value: string}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={value}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'monospace',
        fontSize: 11,
        color: C.textSub,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0
      }}
    >
      <span>{`${value.slice(0, 8)}...`}</span>
      {copied ? <Check size={11} color="#22c55e" /> : <Copy size={11} style={{opacity: 0.5}} />}
    </button>
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
    <p
      style={{
        fontFamily: 'monospace',
        fontSize: 9,
        color: C.textSub,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        marginTop: 16,
        marginBottom: 8
      }}
    >
      {children}
    </p>
  );
}

function DetailPanel({sel, nodes, onClose}: {sel: NonNullable<Selected>; nodes: CognitionFabricNodeTopology[]; onClose: () => void}) {
  const node = nodes.find((n) => n.id === sel.id);
  if (!node) {
    return null;
  }
  const online = node.status === 'online';
  const color = online ? C.cfnOnline : C.cfnOffline;

  return (
    <motion.div
      initial={{opacity: 0, x: 20}}
      animate={{opacity: 1, x: 0}}
      exit={{opacity: 0, x: 20}}
      transition={{duration: 0.15}}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        borderLeft: `1px solid ${C.border}`,
        background: '#0e1420',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 20
      }}
    >
      <div
        style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${C.border}`}}
      >
        <span style={{fontFamily: 'monospace', fontSize: 10, color: C.textSub, letterSpacing: '0.15em', textTransform: 'uppercase'}}>Inspect</span>
        <button
          onClick={onClose}
          style={{color: C.textSub, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center'}}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{flex: 1, overflowY: 'auto', padding: 16}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
          <div style={{width: 8, height: 8, borderRadius: '50%', background: color}} />
          <span style={{fontFamily: 'monospace', fontSize: 9, color, letterSpacing: '0.14em'}}>CFN · {node.status.toUpperCase()}</span>
        </div>
        <p style={{fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2}}>{node.name}</p>
        <div style={{marginBottom: 16}}>
          <PanelId value={node.id} />
        </div>
        <DetailRow label="ip : port" value={node.ip_address ? `${node.ip_address.replace(/^"|"$/g, '')}:${node.port ?? '-'}` : '-'} />
        <DetailRow label="enabled" value={String(node.enabled)} />
        <DetailRow label="last seen" value={formatRelativeTimestamp(node.last_seen, Date.now(), '-')} />
        <DetailRow label="created" value={formatTimestamp(node.created_at, {year: 'numeric', month: 'numeric', day: 'numeric'})} />
        {(node.workspace_ids ?? []).length > 0 && (
          <>
            <SectionLabel>Workspaces ({node.workspace_ids?.length})</SectionLabel>
            {node.workspace_ids?.map((ws) => (
              <p key={ws} style={{fontFamily: 'monospace', fontSize: 11, color: C.textSub, wordBreak: 'break-all', marginBottom: 4}}>
                {ws}
              </p>
            ))}
          </>
        )}
        {(node.cognition_engines ?? []).length > 0 && (
          <>
            <SectionLabel>Cognition Engines ({node.cognition_engines?.length})</SectionLabel>
            {node.cognition_engines?.map((ce) => (
              <div key={ce.id} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <div
                  style={{width: 6, height: 6, borderRadius: '50%', background: ce.status === 'online' ? C.engine : C.cfnOffline, flexShrink: 0}}
                />
                <span
                  style={{fontFamily: 'monospace', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}
                >
                  {ce.name} v{ce.version}
                </span>
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
            letterSpacing: '0.04em'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${C.cfnOnline}30`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${C.cfnOnline}18`;
          }}
        >
          View Node Details <ArrowUpRight size={13} />
        </Link>
      </div>
    </motion.div>
  );
}

function StatGroup({
  label,
  total,
  online,
  offline,
  sub,
  subColor
}: {
  label: string;
  total: number;
  online?: number;
  offline?: number;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div style={{textAlign: 'right'}}>
      <div style={{fontSize: 13, fontWeight: 700, color: C.text}}>
        <span style={{fontSize: 18}}>{total}</span> <span style={{fontSize: 11, color: C.textSub, fontWeight: 400}}>{label}</span>
      </div>
      <div style={{fontSize: 11, fontFamily: 'monospace', marginTop: 2}}>
        {online !== undefined && (
          <>
            <span style={{color: C.cfnOnline}}>{online} online</span> <span style={{color: C.cfnOffline}}>{offline} offline</span>
          </>
        )}
        {sub && <span style={{color: subColor ?? C.textSub}}>{sub}</span>}
      </div>
    </div>
  );
}

// Circular layout: guaranteed min ~220px spacing between adjacent nodes
function nodePositions(n: number): {x: number; y: number}[] {
  const cx = W / 2;
  const cy = H * 0.5;
  if (n === 0) {
    return [];
  }
  if (n === 1) {
    return [{x: cx, y: cy}];
  }
  if (n === 2) {
    return [
      {x: cx - 250, y: cy},
      {x: cx + 250, y: cy}
    ];
  }
  const minDist = 220;
  const rCalc = minDist / (2 * Math.sin(Math.PI / n));
  const r = Math.min(Math.max(rCalc, 180), Math.min(W * 0.37, H * 0.4));
  return Array.from({length: n}, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r};
  });
}

interface CfnTopologyProps {
  nodes: CognitionFabricNodeTopology[];
}

export function CfnTopology({nodes}: CfnTopologyProps) {
  const [sel, setSel] = useState<Selected>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [positions, setPositions] = useState<{x: number; y: number}[]>(() => nodePositions(nodes.length));
  const [isDragging, setIsDragging] = useState(false);
  const [viewScale, setViewScale] = useState(0.8);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    nodeIdx: number;
    startSvgX: number;
    startSvgY: number;
    startNodeX: number;
    startNodeY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setPositions(nodePositions(nodes.length));
  }, [nodes.length]);

  const allCEs = useMemo(() => {
    const seen = new Set<string>();
    const ces: {id: string; status?: string}[] = [];
    for (const node of nodes) {
      for (const ce of node.cognition_engines ?? []) {
        if (!seen.has(ce.id)) {
          seen.add(ce.id);
          ces.push(ce);
        }
      }
    }
    return ces;
  }, [nodes]);

  const onlineCFNs = nodes.filter((n) => n.status === 'online').length;
  const onlineCEs = allCEs.filter((ce) => ce.status === 'online').length;

  const screenToSvg = useCallback((clientX: number, clientY: number): {x: number; y: number} => {
    const svg = svgRef.current;
    if (!svg) {
      return {x: 0, y: 0};
    }
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return {x: 0, y: 0};
    }
    const t = pt.matrixTransform(ctm.inverse());
    return {x: t.x, y: t.y};
  }, []);

  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, nodeIdx: number) => {
      e.stopPropagation();
      const svgPos = screenToSvg(e.clientX, e.clientY);
      dragRef.current = {
        nodeIdx,
        startSvgX: svgPos.x,
        startSvgY: svgPos.y,
        startNodeX: positions[nodeIdx].x,
        startNodeY: positions[nodeIdx].y,
        moved: false
      };
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [positions, screenToSvg]
  );

  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      const svgPos = screenToSvg(e.clientX, e.clientY);
      const dx = svgPos.x - d.startSvgX;
      const dy = svgPos.y - d.startSvgY;
      if (!d.moved && Math.sqrt(dx * dx + dy * dy) > 4) {
        d.moved = true;
        setIsDragging(true);
      }
      if (d.moved) {
        setPositions((prev) => {
          const next = [...prev];
          next[d.nodeIdx] = {x: d.startNodeX + dx, y: d.startNodeY + dy};
          return next;
        });
      }
    },
    [screenToSvg]
  );

  const handleSvgPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = dragRef.current;
      svgRef.current?.releasePointerCapture(e.pointerId);
      setIsDragging(false);
      if (d) {
        if (!d.moved) {
          const node = nodes[d.nodeIdx];
          if (node) {
            setSel((prev) => (prev?.id === node.id ? null : {id: node.id}));
          }
        }
        dragRef.current = null;
      } else {
        setSel(null);
      }
    },
    [nodes]
  );

  const vw = W / viewScale;
  const vh = H / viewScale;
  const vx = (W - vw) / 2;
  const vy = (H - vh) / 2;

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, overflow: 'hidden'}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: onlineCFNs > 0 ? C.cfnOnline : C.textSub,
              boxShadow: onlineCFNs > 0 ? `0 0 6px ${C.cfnOnline}` : 'none'
            }}
          />
          <span style={{fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: C.textSub, fontFamily: 'monospace'}}>COGNITION FABRIC</span>
        </div>
        <div style={{display: 'flex', gap: 32}}>
          <StatGroup label="CFN Nodes" total={nodes.length} online={onlineCFNs} offline={nodes.length - onlineCFNs} />
          <StatGroup label="Cognition Engines" total={allCEs.length} online={onlineCEs} offline={allCEs.length - onlineCEs} />
        </div>
      </div>

      <div style={{flex: 1, display: 'flex', position: 'relative', overflow: 'hidden'}}>
        <svg
          ref={svgRef}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          preserveAspectRatio="xMidYMid slice"
          style={{flex: 1, display: 'block', background: C.bg, cursor: isDragging ? 'grabbing' : 'crosshair'}}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
        >
          <defs>
            <pattern id="fibergrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a2030" strokeWidth="0.5" />
            </pattern>
            <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.8" fill="#1e2a3a" />
            </pattern>
            <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="node-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="pulse-online" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width={W} height={H} fill="url(#fibergrid)" />
          <rect width={W} height={H} fill="url(#dotgrid)" />

          <ellipse
            cx={W * 0.5}
            cy={H * 0.52}
            rx={W * 0.38}
            ry={H * 0.42}
            fill="none"
            stroke="#1e3a5f"
            strokeWidth="1"
            strokeDasharray="6 8"
            opacity="0.5"
          />

          {nodes.map((node, i) => {
            const pos = positions[i];
            if (!pos) {
              return null;
            }
            const active = sel?.id === node.id || hovered === node.id;
            const dx = pos.x - HUB_X;
            const dy = pos.y - HUB_Y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1) {
              return null;
            }
            const ux = dx / len;
            const uy = dy / len;
            const sx = HUB_X + ux * HUB_R;
            const sy = HUB_Y + uy * HUB_R;
            const ex = pos.x - ux * NODE_R;
            const ey = pos.y - uy * NODE_R;
            return (
              <g key={`spoke-${node.id}`}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={ex}
                  y2={ey}
                  stroke="#4a7fa5"
                  strokeWidth={active ? 3 : 1.5}
                  opacity={active ? 0.25 : 0.08}
                  filter="url(#edge-glow)"
                />
                <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#4a7fa5" strokeWidth={active ? 1.5 : 0.8} opacity={active ? 0.9 : 0.35} />
              </g>
            );
          })}

          <g>
            <circle cx={HUB_X} cy={HUB_Y} r={HUB_R + 10} fill="none" stroke="#4a7fa5" strokeWidth="1" opacity="0.12" />
            <circle cx={HUB_X} cy={HUB_Y} r={HUB_R} fill="#0e1a2e" stroke="#4a7fa5" strokeWidth="1.5" opacity="0.85" />
            <foreignObject x={HUB_X - 10} y={HUB_Y - 10} width={20} height={20} style={{pointerEvents: 'none'}}>
              <Network size={20} color="#4a7fa5" />
            </foreignObject>
          </g>

          {nodes.map((node, i) => {
            const pos = positions[i];
            if (!pos) {
              return null;
            }
            const isSelected = sel?.id === node.id;
            const isHovered = hovered === node.id;
            const online = node.status === 'online';
            const ringColor = online ? C.cfnOnline : C.cfnOffline;
            const dotColor = online ? C.cfnOnline : C.cfnOffline;
            const engines = node.cognition_engines ?? [];
            const onlineCEs = engines.filter((e) => e.status === 'online').length;
            const offlineCEs = engines.length - onlineCEs;
            const [line1, line2] = splitName(node.name, 17);
            const nameY = line2 ? -26 : -19;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{cursor: isDragging ? 'grabbing' : 'grab'}}
                onPointerDown={(e) => handleNodePointerDown(e, i)}
                onMouseEnter={() => {
                  if (!dragRef.current) {
                    setHovered(node.id);
                  }
                }}
                onMouseLeave={() => setHovered(null)}
              >
                {online && (
                  <circle r={NODE_R + 20} fill="url(#pulse-online)" opacity={isSelected || isHovered ? 0.8 : 0.4}>
                    <animate attributeName="r" values={`${NODE_R + 6};${NODE_R + 28};${NODE_R + 6}`} dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
                  </circle>
                )}

                {(isSelected || isHovered) && (
                  <circle r={NODE_R + 8} fill="none" stroke={dotColor} strokeWidth="1" opacity="0.5" strokeDasharray="3 4" />
                )}

                <circle r={NODE_R} fill="#0d1520" stroke={ringColor} strokeWidth={isSelected ? 2.5 : 1.5} />
                <circle r={NODE_R - 2} fill={dotColor} opacity="0.06" />
                <text textAnchor="middle" y={nameY} fontSize="11" fontWeight="700" fill={C.text} fontFamily="'Inter', system-ui, sans-serif">
                  {line1}
                </text>
                {line2 && (
                  <text textAnchor="middle" y={nameY + 13} fontSize="11" fontWeight="700" fill={C.text} fontFamily="'Inter', system-ui, sans-serif">
                    {line2}
                  </text>
                )}

                <line x1={-40} y1={-8} x2={40} y2={-8} stroke="#2e4060" strokeWidth="0.7" opacity="0.8" />

                <text textAnchor="middle" y={4} fontSize="9" fontFamily="monospace">
                  {onlineCEs > 0 && offlineCEs > 0 ? (
                    <>
                      <tspan fill={C.cfnOnline}>●</tspan>
                      <tspan fill={C.text}> {onlineCEs} </tspan>
                      <tspan fill={C.cfnOffline}>●</tspan>
                      <tspan fill={C.text}> {offlineCEs}</tspan>
                    </>
                  ) : onlineCEs > 0 ? (
                    <>
                      <tspan fill={C.cfnOnline}>●</tspan>
                      <tspan fill={C.text}> {onlineCEs} Cognition Engines</tspan>
                    </>
                  ) : offlineCEs > 0 ? (
                    <>
                      <tspan fill={C.cfnOffline}>●</tspan>
                      <tspan fill={C.text}> {offlineCEs} Cognition Engines</tspan>
                    </>
                  ) : (
                    <tspan fill={C.textSub}>0 Cognition Engines</tspan>
                  )}
                </text>
                {onlineCEs > 0 && offlineCEs > 0 && (
                  <text textAnchor="middle" y={15} fontSize="9" fill={C.textSub} fontFamily="monospace">
                    Cognition Engines
                  </text>
                )}
              </g>
            );
          })}

          {nodes.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fontFamily="monospace" fill={C.textSub} letterSpacing="0.08em">
              No nodes registered in the fabric.
            </text>
          )}
        </svg>

        <div style={{position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 10}}>
          {[
            {icon: <Plus size={12} />, title: 'Zoom in', action: () => setViewScale((s) => Math.min(s * 1.25, 4))},
            {icon: <Minus size={12} />, title: 'Zoom out', action: () => setViewScale((s) => Math.max(s / 1.25, 0.25))},
            {icon: <Maximize2 size={11} />, title: 'Fit view', action: () => setViewScale(1)}
          ].map((btn) => (
            <button
              key={btn.title}
              title={btn.title}
              onClick={btn.action}
              style={{
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                color: C.textSub,
                cursor: 'pointer'
              }}
            >
              {btn.icon}
            </button>
          ))}
        </div>

        <AnimatePresence>{sel && <DetailPanel key={sel.id} sel={sel} nodes={nodes} onClose={() => setSel(null)} />}</AnimatePresence>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          background: C.surface,
          borderTop: `1px solid ${C.border}`,
          fontSize: 11,
          color: C.textSub,
          fontFamily: 'monospace',
          flexShrink: 0
        }}
      >
        <div style={{display: 'flex', gap: 20}}>
          {[
            ['online', C.cfnOnline],
            ['offline', C.cfnOffline]
          ].map(([label, color]) => (
            <div key={label} style={{display: 'flex', alignItems: 'center', gap: 5}}>
              <div style={{width: 7, height: 7, borderRadius: '50%', background: color}} />
              {label}
            </div>
          ))}
          <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
            <div style={{width: 20, height: 0, borderTop: '1px solid #4a7fa566'}} />
            fabric connection
          </div>
        </div>
        <div>drag to reposition · click node to inspect · click canvas to deselect</div>
      </div>
    </div>
  );
}
