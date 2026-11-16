// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import type {components} from '@/api/generated/schema';

export type TopologyGraph = components['schemas']['TopologyRead'];
export type TopologySource = TopologyGraph['source'];
export type TopologyMAS = Pick<components['schemas']['MultiAgenticSystem'], 'topologies' | 'topology_sources' | 'agents' | 'tools'>;
export type TopologyView = {status: 'available'; graph: TopologyGraph} | {status: 'absent' | 'disabled' | 'unavailable'; message: string};

export function topologySourceView(mas: TopologyMAS, source: TopologySource): TopologyView {
  const title = source === 'provided' ? 'Provided' : 'Observed';
  const graph = Array.isArray(mas.topologies) ? mas.topologies.find((candidate) => candidate?.source === source) : undefined;
  const status = mas.topology_sources?.[source]?.status ?? (graph ? 'available' : source === 'provided' ? 'absent' : 'disabled');
  if (status !== 'available') {
    const messages = {
      absent: `No ${source} topology has been supplied.`,
      disabled: `${title} topology is disabled.`,
      unavailable: `${title} topology is unavailable. Other MAS information is still available.`
    };
    return {status, message: messages[status]};
  }
  if (!graph || !validGraph(graph)) {
    return {status: 'unavailable', message: `${title} topology could not be displayed because its graph data is missing or invalid.`};
  }
  return {status: 'available', graph};
}

// A bad optional graph must not break the other MAS tabs. Validate the render
// boundary rather than inventing missing nodes, tool assignments or edges.
function validGraph(graph: TopologyGraph): boolean {
  if (!['complete', 'partial'].includes(graph.completeness) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return false;
  }
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    const kind = node?.type === undefined ? 'agent' : node.type;
    if (!node || typeof node.id !== 'string' || ids.has(node.id) || !['agent', 'start', 'end'].includes(kind)) {
      return false;
    }
    if (node.tool_ids !== undefined && (!Array.isArray(node.tool_ids) || node.tool_ids.some((id) => typeof id !== 'string'))) {
      return false;
    }
    ids.add(node.id);
  }
  return graph.edges.every((edge) => edge && ids.has(edge.source) && ids.has(edge.target));
}

export type TopologyTool = {id: string; provider?: string; unresolved: boolean};
export type TopologyAgentNode = {
  id: string;
  kind: components['schemas']['TopologyNode']['type'];
  name: string;
  tools: TopologyTool[] | undefined;
  rank: number;
  isolated: boolean;
  height: number;
  position: {x: number; y: number};
};

// Rank each node once, so reciprocal relationships and rootless cycles cannot
// keep increasing ranks. Positions describe the graph, not execution order.
function topologyLayout(graph: TopologyGraph, heights: ReadonlyMap<string, number>) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    connected.add(edge.source);
    connected.add(edge.target);
  }
  const ranks = new Map<string, number>();
  const visit = (seeds: string[]) => {
    const queue: string[] = [];
    for (const id of seeds) {
      if (!ranks.has(id)) {
        ranks.set(id, 0);
        queue.push(id);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const target of outgoing.get(id) ?? []) {
        if (!ranks.has(target)) {
          ranks.set(target, ranks.get(id)! + 1);
          queue.push(target);
        }
      }
    }
  };
  visit(graph.nodes.filter((node) => connected.has(node.id) && (node.type === 'start' || incoming.get(node.id) === 0)).map((node) => node.id));
  for (const node of graph.nodes) {
    if (connected.has(node.id) && !ranks.has(node.id)) {
      visit([node.id]);
    }
  }
  const nonEnd = graph.nodes.filter((node) => node.type !== 'end');
  const lastRank = nonEnd.length ? Math.max(...nonEnd.map((node) => ranks.get(node.id) ?? 0)) + 1 : 0;
  const columns = new Map<number, string[]>();
  const height = (id: string) => heights.get(id) ?? 144;
  for (const node of graph.nodes) {
    const rank = node.type === 'end' ? lastRank : (ranks.get(node.id) ?? 0);
    ranks.set(node.id, rank);
    if (connected.has(node.id)) {
      const column = columns.get(rank) ?? [];
      column.push(node.id);
      columns.set(rank, column);
    }
  }
  const columnHeight = (ids: string[]) => ids.reduce((sum, id) => sum + height(id), 0) + Math.max(0, ids.length - 1) * 64;
  const flowHeight = Math.max(0, ...[...columns.values()].map(columnHeight));
  const positions = new Map<string, {x: number; y: number}>();
  for (const [rank, ids] of columns) {
    let y = (flowHeight - columnHeight(ids)) / 2;
    for (const id of ids) {
      positions.set(id, {x: rank * 260, y});
      y += height(id) + 64;
    }
  }
  let isolatedY = connected.size ? flowHeight + 80 : 0;
  for (const node of graph.nodes) {
    if (!connected.has(node.id)) {
      positions.set(node.id, {x: ranks.get(node.id)! * 260, y: isolatedY});
      isolatedY += height(node.id) + 64;
    }
  }
  return {ranks, positions, connected, height};
}

export function topologyNodes(graph: TopologyGraph, mas: TopologyMAS, heights: ReadonlyMap<string, number> = new Map()): TopologyAgentNode[] {
  const agents = new Map((mas.agents ?? []).map((agent) => [agent.agent_id, agent]));
  const tools = new Map((mas.tools ?? []).map((tool) => [tool.tool_id, tool]));
  const layout = topologyLayout(graph, heights);
  return graph.nodes.map((node) => {
    // Management preserves field presence; an omitted type still defaults to
    // agent under the contract. Apply that default only to the presentation.
    const kind = node.type === undefined ? 'agent' : node.type;
    return {
      id: node.id,
      kind,
      name: kind === 'agent' ? agents.get(node.id)?.name?.trim() || node.id : kind === 'start' ? 'Start' : 'End',
      tools:
        kind !== 'agent' || node.tool_ids === undefined
          ? undefined
          : node.tool_ids.map((id) => {
              const tool = tools.get(id);
              return {
                id,
                provider: tool?.provider ? `${tool.provider.mcp_server_name} / ${tool.provider.native_tool_name}` : undefined,
                unresolved: !tool
              };
            }),
      rank: layout.ranks.get(node.id)!,
      isolated: !layout.connected.has(node.id),
      height: layout.height(node.id),
      position: layout.positions.get(node.id)!
    };
  });
}

export function toolAssignmentSummary(tools: TopologyTool[] | undefined): string {
  return tools === undefined
    ? 'Tool assignments unknown'
    : tools.length === 0
      ? 'No tools declared'
      : `${tools.length} assigned tool${tools.length === 1 ? '' : 's'}`;
}
