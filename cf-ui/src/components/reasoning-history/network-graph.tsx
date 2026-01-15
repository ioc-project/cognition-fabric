'use client';

import {useEffect, useCallback, useMemo} from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {Card} from '@/components/ui/card';
import type {ReasoningHistoryContent} from '@/api/types/reasoning-history';

interface SelectedNodeInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  domain: string;
}

interface NetworkGraphProps {
  data: ReasoningHistoryContent;
  onNodeSelect: (node: SelectedNodeInfo) => void;
  selectedNode: SelectedNodeInfo | null;
}

const TYPE_COLORS: Record<string, string> = {
  concept: '#3b82f6',
  constraint: '#f59e0b',
  entity: '#10b981',
  Process: '#8b5cf6',
  Feature: '#ec4899',
  Technology: '#06b6d4',
  Service: '#14b8a6',
  other: '#64748b'
};

type CustomNodeData = {
  label: string;
  type: string;
  description: string;
  domain: string;
};

function CustomNode({data, selected}: {data: CustomNodeData; selected: boolean}) {
  const bgColor = TYPE_COLORS[data.type] || TYPE_COLORS.other;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg transition-all ${selected ? 'border-white shadow-xl scale-105' : 'border-white/20'}`}
      style={{
        backgroundColor: bgColor,
        minWidth: '120px',
        maxWidth: '180px'
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/50 !w-2 !h-2" />
      <div className="text-white text-sm font-medium text-center truncate" title={data.label}>
        {data.label}
      </div>
      {data.type && <div className="text-white text-xs text-center mt-1 capitalize">{data.type}</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-white/50 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode
};

export function NetworkGraph({data, onNodeSelect, selectedNode}: NetworkGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!data) {
      return;
    }

    const nodeMap = new Map<string, any>();
    const linkList: {source: string; target: string; relationship: string}[] = [];
    const linkSet = new Set<string>();

    const addNode = (name: string, type: string, description: string, domain: string, isMain: boolean = false) => {
      const id = name.toLowerCase().replace(/\s+/g, '_');
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          name,
          type: type || 'concept',
          description: description || '',
          domain: domain || 'other',
          isMain
        });
      }
      return id;
    };

    const addLink = (sourceName: string, targetName: string, relationship: string) => {
      const sourceId = sourceName.toLowerCase().replace(/\s+/g, '_');
      const targetId = targetName.toLowerCase().replace(/\s+/g, '_');
      const linkKey = `${sourceId}-${relationship}-${targetId}`;

      if (!linkSet.has(linkKey) && sourceId !== targetId) {
        linkSet.add(linkKey);
        linkList.push({source: sourceId, target: targetId, relationship});
      }
    };

    if (data.evidence?.entity?.name) {
      addNode(data.evidence.entity.name, 'entity', data.evidence.entity.description || 'The queried entity', 'Query', true);
    }

    data.evidence?.details?.concepts?.forEach((concept) => {
      addNode(concept.name, concept.type, concept.description || '', concept.attributes?.domain || '');
    });

    data.evidence?.details?.relations?.forEach((rel) => {
      if (rel.attributes?.source_name && rel.attributes?.target_name) {
        addNode(rel.attributes.source_name, 'concept', '', '');
        addNode(rel.attributes.target_name, 'concept', '', '');
        addLink(rel.attributes.source_name, rel.attributes.target_name, rel.relationship);
      }
    });

    const validLinks = linkList.filter((link) => nodeMap.has(link.source) && nodeMap.has(link.target));

    const nodeArray = Array.from(nodeMap.values());
    const centerX = 400;
    const centerY = 300;
    const radius = Math.max(200, nodeArray.length * 30);

    // const _mainNode = nodeArray.find((n) => n.isMain || n.type === 'entity');

    const flowNodes: Node<CustomNodeData>[] = nodeArray.map((node, _index) => {
      let x, y;

      if (node.isMain || node.type === 'entity') {
        x = centerX;
        y = centerY;
      } else {
        const otherNodes = nodeArray.filter((n) => !n.isMain && n.type !== 'entity');
        const otherIndex = otherNodes.findIndex((n) => n.id === node.id);
        const angle = (2 * Math.PI * otherIndex) / otherNodes.length - Math.PI / 2;
        x = centerX + radius * Math.cos(angle);
        y = centerY + radius * Math.sin(angle);
      }

      return {
        id: node.id,
        type: 'custom',
        position: {x, y},
        data: {
          label: node.name,
          type: node.type,
          description: node.description,
          domain: node.domain
        } as CustomNodeData,
        selected: selectedNode?.id === node.id
      } as Node<CustomNodeData>;
    });

    const flowEdges: Edge[] = validLinks.map((link, index) => ({
      id: `e-${link.source}-${link.target}-${index}`,
      source: link.source,
      target: link.target,
      label: link.relationship.replace(/_/g, ' '),
      type: 'smoothstep',
      animated: true,
      style: {stroke: '#64b5f6', strokeWidth: 2},
      labelStyle: {
        fill: '#94a3b8',
        fontSize: 11,
        fontWeight: 500
      },
      labelBgStyle: {
        fill: '#1e293b',
        fillOpacity: 0.9
      },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#64b5f6',
        width: 20,
        height: 20
      }
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [data, selectedNode?.id, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<CustomNodeData>) => {
      onNodeSelect({
        id: node.id,
        name: node.data.label,
        type: node.data.type,
        description: node.data.description,
        domain: node.data.domain
      });
    },
    [onNodeSelect]
  );

  const usedTypes = useMemo(() => {
    const types = new Set(nodes.map((n) => n.data.type));
    return Array.from(types).filter((t) => TYPE_COLORS[t]);
  }, [nodes]);

  if (nodes.length === 0) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">No knowledge graph data available</div>;
  }

  return (
    <div className="relative w-full h-full min-h-[600px]" style={{backgroundColor: '#0f172a', height: '100%'}}>
      <div className="absolute top-4 left-4 z-10">
        <Card className="p-3 bg-slate-900/95 border-slate-700 backdrop-blur-sm">
          <div className="text-xs font-medium mb-2 text-foreground">Node Types</div>
          <div className="space-y-1.5">
            {usedTypes.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: TYPE_COLORS[type]}} />
                <span className="text-xs text-foreground capitalize">{type}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="absolute top-4 right-4 z-10">
        <div className="text-xs text-white bg-slate-900/80 px-3 py-1.5 rounded border border-slate-700">
          {nodes.length} nodes · {edges.length} connections
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{padding: 0.4, maxZoom: 0.6}}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true
        }}
        proOptions={{hideAttribution: true}}
      >
        <Controls className="!bg-slate-800 !border-slate-700 !rounded-lg [&>button]:!bg-slate-700 [&>button]:!border-slate-600 [&>button]:!text-white [&>button:hover]:!bg-slate-600" />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
      </ReactFlow>

      {selectedNode && (
        <Card className="absolute bottom-16 right-4 z-10 p-4 max-w-xs bg-slate-900/95 border-slate-700 backdrop-blur-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: TYPE_COLORS[selectedNode.type] || '#64748b'}} />
              <span className="font-medium text-sm text-foreground">{selectedNode.name}</span>
            </div>
            <div className="text-sm text-foreground">
              <span className="font-medium">Type:</span> {selectedNode.type}
            </div>
            {selectedNode.domain && selectedNode.domain !== 'other' && (
              <div className="text-sm text-foreground">
                <span className="font-medium">Domain:</span> {selectedNode.domain}
              </div>
            )}
            {selectedNode.description && <p className="text-sm text-muted-foreground line-clamp-3">{selectedNode.description}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
