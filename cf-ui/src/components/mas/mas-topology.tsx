// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {createContext, useCallback, useContext, useId, useMemo, useRef, useState} from 'react';
import {AnimatePresence} from 'framer-motion';
import {Background, BaseEdge, Controls, Handle, MarkerType, Position, ReactFlow, getBezierPath} from '@xyflow/react';
import type {Edge, EdgeProps, Node, NodeChange, NodeProps} from '@xyflow/react';
import {CircleStop, Play} from 'lucide-react';
import {topologyColors as C} from '@/components/ui/topology-colors';
import {formatTimestamp} from '@/lib/utils';
import {TopologyJSON} from './mas-json-editor';
import {MASTopologyDetails} from './mas-topology-details';
import {topologyNodes, topologySourceView, toolAssignmentSummary} from './mas-topology-model';
import type {TopologyAgentNode, TopologyGraph, TopologyMAS, TopologySource} from './mas-topology-model';
import '@xyflow/react/dist/style.css';
import styles from './mas-topology.module.css';

type AgentNode = Node<TopologyAgentNode, 'masAgent'>;
type TopologyInteraction = {selected: string | null; panelId: string; inspect: (id: string, trigger: HTMLButtonElement) => void};
const TopologyInteractionContext = createContext<TopologyInteraction | null>(null);
type Relation = Edge<{lane: number; route: 'forward' | 'return' | 'same-rank' | 'self'; outer: boolean; outerY: number}, 'masRelation'>;

function AgentCard({data}: NodeProps<AgentNode>) {
  const interaction = useContext(TopologyInteractionContext);
  if (!interaction) {
    throw new Error('Topology nodes require the interaction provider');
  }
  const selected = interaction.selected === data.id;
  const agent = data.kind === 'agent';
  const color = agent ? C.cfnOnline : data.kind === 'start' ? C.engine : '#94a3b8';
  const Icon = data.kind === 'start' ? Play : CircleStop;
  return (
    <div className={`${styles.node} ${agent ? styles.agentNode : styles.markerNode}`} data-selected={selected} style={{borderColor: color}}>
      <Handle type="target" position={Position.Left} isConnectable={false} className={styles.handle} />
      <Handle type="source" position={Position.Right} isConnectable={false} className={styles.handle} />
      <Handle id="return-source" type="source" position={Position.Left} isConnectable={false} className={styles.handle} />
      <Handle id="return-target" type="target" position={Position.Right} isConnectable={false} className={styles.handle} />
      <Handle
        id="self-target"
        type="target"
        position={Position.Right}
        isConnectable={false}
        className={styles.handle}
        style={{top: '75%', right: agent ? '6.7%' : undefined}}
      />
      <Handle
        id="self-source"
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={styles.handle}
        style={{top: '25%', right: agent ? '6.7%' : undefined}}
      />
      <button
        type="button"
        className={`nodrag nopan ${styles.nodeButton}`}
        aria-label={agent ? `Agent ${data.name}, ID ${data.id}` : `${data.name} node, ID ${data.id}`}
        aria-pressed={selected}
        aria-controls={selected ? interaction.panelId : undefined}
        title={`${data.name}\n${data.id}`}
        onClick={(event) => interaction.inspect(data.id, event.currentTarget)}
      >
        {!agent && <Icon size={14} color={color} />}
        <span className={styles.nodeName}>{data.name}</span>
        {agent ? (
          <span className={styles.nodeSummary}>{toolAssignmentSummary(data.tools)}</span>
        ) : (
          <span className="break-all font-mono text-[10px] text-slate-400">{data.id}</span>
        )}
        {data.isolated && <span className="mt-1 block text-[10px] text-slate-400">No declared edges</span>}
      </button>
    </div>
  );
}

function RelationshipEdge(props: EdgeProps<Relation>) {
  const {sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition} = props;
  const lane = props.data?.lane ?? 0;
  let [path, labelX, labelY] = getBezierPath({sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition});
  if (props.data?.route === 'self') {
    const radius = Math.min(80, 48 + lane * 12);
    path = `M ${sourceX},${sourceY} C ${sourceX + radius},${sourceY} ${targetX + radius},${targetY} ${targetX},${targetY}`;
    labelX = sourceX + radius;
    labelY = (sourceY + targetY) / 2;
  } else if (props.data?.route === 'same-rank') {
    const side = sourcePosition === Position.Right ? 1 : -1;
    const reach = 48 + Math.min(lane * 8, 24);
    path = `M ${sourceX},${sourceY} C ${sourceX + side * reach},${sourceY} ${targetX + side * reach},${targetY} ${targetX},${targetY}`;
    labelX = sourceX + side * reach;
    labelY = (sourceY + targetY) / 2;
  } else if (props.data?.outer) {
    // Long connections pass through the gaps between columns and an outer
    // lane, rather than cutting across intermediate agent cards.
    const direction = props.data.route === 'return' ? -1 : 1;
    const sx = sourceX + direction * 32;
    const tx = targetX - direction * 32;
    const y = props.data.outerY;
    path = `M ${sourceX},${sourceY} L ${sx},${sourceY} L ${sx},${y} L ${tx},${y} L ${tx},${targetY} L ${targetX},${targetY}`;
    labelX = (sx + tx) / 2;
    labelY = y;
  } else if (props.data?.route === 'return') {
    // Use the source's left edge and target's right edge, keeping the return
    // curve inside the inter-column gap and distinct from the forward edge.
    const offset = 32 + lane * 10;
    const reach = (sourceX - targetX) / 3;
    path = `M ${sourceX},${sourceY} C ${sourceX - reach},${sourceY + offset} ${targetX + reach},${targetY + offset} ${targetX},${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2 + offset;
  }
  return (
    <BaseEdge
      id={props.id}
      markerEnd={props.markerEnd}
      style={props.style}
      label={props.label}
      path={path}
      labelX={labelX}
      labelY={labelY}
      interactionWidth={0}
      labelStyle={{fill: C.text, fontSize: 10}}
      labelBgStyle={{fill: C.surface}}
    />
  );
}

const nodeTypes = {masAgent: AgentCard};
const edgeTypes = {masRelation: RelationshipEdge};

function TopologyCanvas({graph, mas}: {graph: TopologyGraph; mas: TopologyMAS}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const inspect = useCallback((id: string, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelected((previous) => (previous === id ? null : id));
  }, []);
  const closeDetails = useCallback(() => {
    setSelected(null);
    triggerRef.current?.focus({preventScroll: true});
  }, []);
  const interaction = useMemo(() => ({selected, panelId, inspect}), [selected, panelId, inspect]);
  const model = useMemo(() => topologyNodes(graph, mas, heights), [graph, mas, heights]);
  const onNodesChange = useCallback((changes: NodeChange<AgentNode>[]) => {
    setHeights((previous) => {
      const next = new Map(previous);
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions?.height) {
          next.set(change.id, change.dimensions.height);
        }
      }
      return [...next].some(([id, height]) => previous.get(id) !== height) ? next : previous;
    });
  }, []);
  const nodes: AgentNode[] = useMemo(
    () =>
      model.map((node) => ({
        id: node.id,
        type: 'masAgent',
        position: node.position,
        // React Flow disables pointer events when canvas editing/selection are
        // off. Keep the read-only Inspect button interactive.
        style: {pointerEvents: 'all'},
        data: node
      })),
    // Selection is presentation state in context. Replacing these objects on
    // every click makes React Flow discard measured sizes and hide the nodes.
    [model]
  );
  const edges: Relation[] = useMemo(() => {
    const lanes = new Map<string, number>();
    const byId = new Map(model.map((node) => [node.id, node]));
    const flow = model.filter((node) => !node.isolated);
    const top = Math.min(0, ...flow.map((node) => node.position.y));
    const bottom = Math.max(0, ...flow.map((node) => node.position.y + node.height));
    return graph.edges.map((edge, index) => {
      const pair = JSON.stringify([edge.source, edge.target]);
      const lane = lanes.get(pair) ?? 0;
      lanes.set(pair, lane + 1);
      const source = byId.get(edge.source)!;
      const target = byId.get(edge.target)!;
      const route = source.id === target.id ? 'self' : source.rank === target.rank ? 'same-rank' : source.rank > target.rank ? 'return' : 'forward';
      const outer = Math.abs(source.rank - target.rank) > 1;
      const sameRankRight = route === 'same-rank' && source.position.y < target.position.y;
      const active = selected === edge.source || selected === edge.target || hovered === edge.source || hovered === edge.target;
      return {
        id: `relation-${index}`,
        type: 'masRelation',
        source: edge.source,
        target: edge.target,
        sourceHandle:
          route === 'self' ? 'self-source' : route === 'return' || (route === 'same-rank' && !sameRankRight) ? 'return-source' : undefined,
        targetHandle: route === 'self' ? 'self-target' : route === 'return' || sameRankRight ? 'return-target' : undefined,
        data: {lane, route, outer, outerY: source.position.y <= target.position.y ? top - 80 - index * 12 : bottom + 80 + index * 12},
        label: edge.interaction_type || (edge.conditional ? 'conditional' : undefined),
        markerEnd: {type: MarkerType.ArrowClosed, color: C.edge, width: 18, height: 18},
        style: {stroke: C.edge, strokeWidth: active ? 1.5 : 0.8, opacity: active ? 0.9 : 0.45, strokeDasharray: edge.conditional ? '5 4' : undefined},
        ariaLabel: `${edge.source} to ${edge.target}${edge.interaction_type ? `, ${edge.interaction_type}` : ''}`
      };
    });
  }, [graph, model, selected, hovered]);
  const selectedNode = model.find((node) => node.id === selected);
  return (
    <>
      <div
        className={styles.canvas}
        role="region"
        aria-label="MAS topology graph"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && selected) {
            event.stopPropagation();
            closeDetails();
          }
        }}
      >
        <TopologyInteractionContext.Provider value={interaction}>
          <ReactFlow<AgentNode, Relation>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesReconnectable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            onPaneClick={() => {
              if (selected) {
                closeDetails();
              }
            }}
            onNodeMouseEnter={(_event, node) => setHovered(node.id)}
            onNodeMouseLeave={() => setHovered(null)}
            fitView
            fitViewOptions={{padding: 0.25, maxZoom: 1}}
            minZoom={0.1}
            maxZoom={2}
            colorMode="dark"
            style={{background: C.bg}}
            ariaLabelConfig={{
              'controls.zoomIn.ariaLabel': 'Zoom in',
              'controls.zoomOut.ariaLabel': 'Zoom out',
              'controls.fitView.ariaLabel': 'Fit view'
            }}
          >
            <Background color="#24344a" gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </TopologyInteractionContext.Provider>
        <AnimatePresence initial={false} mode="wait">
          {selectedNode && (
            <MASTopologyDetails key={selectedNode.id} id={panelId} node={selectedNode} graph={graph} mas={mas} onClose={closeDetails} />
          )}
        </AnimatePresence>
      </div>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        Drag the canvas to pan · scroll to zoom · click a node to inspect · click canvas to deselect
      </p>
      <details className="border-t border-border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Topology as a list</summary>
        <ul className="mt-4 space-y-3">
          {model.map((node) => (
            <li key={node.id} className="break-words">
              <span className="font-medium">{node.name}</span> <code className="text-xs text-muted-foreground"># {node.id}</code>
              {node.isolated && <span className="ml-2 text-xs text-muted-foreground">No declared edges</span>}
              {node.kind === 'agent' && (
                <p className="text-xs text-muted-foreground">
                  {node.tools === undefined
                    ? 'Tool assignments unknown'
                    : node.tools.length
                      ? `Tools: ${node.tools.map((tool) => tool.id).join(', ')}`
                      : 'No tools declared'}
                </p>
              )}
            </li>
          ))}
        </ul>
        <h4 className="mb-2 mt-4 font-medium">Directed relationships</h4>
        {graph.edges.length ? (
          <ul className="space-y-1 text-xs">
            {graph.edges.map((edge, i) => (
              <li key={i} className="break-words">
                <code>{edge.source}</code> → <code>{edge.target}</code>
                {edge.interaction_type && ` (${edge.interaction_type})`}
                {edge.conditional && ' · conditional'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No relationships declared.</p>
        )}
      </details>
    </>
  );
}

export function MASTopology({mas}: {mas: TopologyMAS}) {
  const provided = topologySourceView(mas, 'provided');
  const observed = topologySourceView(mas, 'observed');
  const [source, setSource] = useState<TopologySource>(() =>
    provided.status !== 'available' && observed.status === 'available' ? 'observed' : 'provided'
  );
  const view = source === 'provided' ? provided : observed;
  const title = source === 'provided' ? 'Provided' : 'Observed';
  const updatedAt = view.status === 'available' ? view.graph.updated_at : undefined;
  const sourceSummary =
    view.status === 'available'
      ? `${view.graph.nodes.length} nodes · ${view.graph.edges.length} directed relationships · ${view.graph.completeness === 'partial' ? 'Partial' : 'Complete'}`
      : {absent: 'Not supplied', disabled: 'Disabled', unavailable: 'Unavailable'}[view.status];
  return (
    <section className="space-y-4" aria-label="MAS topology">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Topology source" className="flex gap-1 rounded border border-border bg-card p-1">
          {(['provided', 'observed'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={source === item}
              onClick={() => setSource(item)}
              className={`rounded px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${source === item ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {item === 'provided' ? 'Provided' : 'Observed'}
            </button>
          ))}
        </div>
        {observed.status !== 'available' && (
          <p aria-hidden={source !== 'provided'} className={`text-xs text-muted-foreground ${source === 'provided' ? '' : 'invisible'}`}>
            {observed.status === 'disabled'
              ? 'Observed topology is disabled.'
              : observed.status === 'absent'
                ? 'No observed topology is available.'
                : 'Observed topology is unavailable.'}
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded border border-border bg-card">
        <header className={`${styles.sourceHeader} border-b border-border px-4 py-3`}>
          <div className={styles.sourceHeading}>
            <h3 className="truncate text-sm font-medium">{title} topology</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{sourceSummary}</p>
          </div>
          <div className={`${styles.sourceTimeSlot} text-muted-foreground`} aria-hidden={!updatedAt}>
            {updatedAt && (
              <time dateTime={updatedAt} title={updatedAt}>
                Updated {formatTimestamp(updatedAt)}
              </time>
            )}
          </div>
        </header>
        {view.status === 'available' ? (
          view.graph.nodes.length ? (
            <TopologyCanvas key={JSON.stringify(view.graph)} graph={view.graph} mas={mas} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">This topology is explicitly empty. No nodes or relationships are declared.</p>
          )
        ) : (
          <div role="status" className="p-6 text-sm text-muted-foreground">
            <p>{view.message}</p>
          </div>
        )}
      </div>
      {view.status === 'available' && <TopologyJSON value={JSON.stringify([view.graph], null, 2)} readOnly showEditor={false} sourceLabel={title} />}
    </section>
  );
}
