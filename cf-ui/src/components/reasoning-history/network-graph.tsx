'use client';

import {useEffect, useCallback, useMemo, useState} from 'react';
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
import {LoaderRelative} from '@/components/ui/loading';
import type {ReasoningHistoryContent} from '@/api/types/reasoning-history';
import {GRAPH_LAYOUT, NODE_TYPE_COLORS, calculateGraphRadius} from '@/constants/reasoning-history';

interface SelectedNodeInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  domain: string;
}

interface NetworkGraphProps {
  data: ReasoningHistoryContent | ReasoningHistoryContent[];
  onNodeSelect: (node: SelectedNodeInfo) => void;
  selectedNode: SelectedNodeInfo | null;
}

// Node type colors imported from @/constants/reasoning-history

type CustomNodeData = {
  label: string;
  type: string;
  description: string;
  domain: string;
  entityIndex?: number;
  entityName?: string;
};

function CustomNode({data, selected}: {data: CustomNodeData; selected: boolean}) {
  // Use concept color for both concepts and entities
  const bgColor = NODE_TYPE_COLORS[data.type] || NODE_TYPE_COLORS.concept;

  return (
    <div
      className={`flex items-center justify-center rounded-full border-2 shadow-lg transition-all ${selected ? 'border-white shadow-xl scale-105' : 'border-white/20'}`}
      style={{
        backgroundColor: bgColor,
        width: '120px',
        height: '120px'
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/50 !w-2 !h-2" />
      <div className="flex flex-col items-center justify-center p-2">
        <div className="text-white text-xs font-medium text-center line-clamp-2" title={data.label}>
          {data.label}
        </div>
        {data.type && <div className="text-white/70 text-[10px] text-center mt-0.5 capitalize">{data.type}</div>}
      </div>
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
  const [isCalculating, setIsCalculating] = useState(true);
  const [entityNames, setEntityNames] = useState<string[]>([]);

  // Normalize data to always be an array
  const records = useMemo(() => (Array.isArray(data) ? data : [data]), [data]);
  const hasMultipleEntities = records.length > 1;

  useEffect(() => {
    if (!data || (Array.isArray(data) && data.length === 0)) {
      setIsCalculating(false);
      return;
    }

    setIsCalculating(true);

    const nodeMap = new Map<string, any>();
    const linkList: {source: string; target: string; relationship: string}[] = [];
    const linkSet = new Set<string>();
    const entityNamesList: string[] = [];

    const addNode = (
      name: string,
      type: string,
      description: string,
      domain: string,
      isMain: boolean = false,
      entityIndex?: number,
      entityName?: string
    ) => {
      const id = name.toLowerCase().replace(/\s+/g, '_');
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          name,
          type: type || 'concept',
          description: description || '',
          domain: domain || 'other',
          isMain,
          entityIndex,
          entityName
        });
      } else if (isMain && entityIndex !== undefined) {
        // Update existing node to mark it as main entity if it wasn't already
        const existing = nodeMap.get(id);
        if (!existing.isMain) {
          existing.isMain = true;
          existing.entityIndex = entityIndex;
          existing.entityName = entityName;
          existing.type = 'entity';
        }
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

    // Process each record (entity)
    records.forEach((record, entityIndex) => {
      if (!record) {
        return;
      }

      const entityName = record.evidence?.entity?.name || record.trace?.extracted_entity || `Entity ${entityIndex + 1}`;
      entityNamesList.push(entityName);

      if (record.evidence?.entity?.name) {
        addNode(
          record.evidence.entity.name,
          'entity',
          record.evidence.entity.description || 'The queried entity',
          'Query',
          true,
          entityIndex,
          entityName
        );
      }

      record.evidence?.details?.concepts?.forEach((concept) => {
        addNode(concept.name, concept.type || 'concept', concept.description || '', concept.attributes?.domain || '');
      });

      record.evidence?.details?.relations?.forEach((rel) => {
        if (rel.attributes?.source_name && rel.attributes?.target_name) {
          addNode(rel.attributes.source_name, 'concept', '', '');
          addNode(rel.attributes.target_name, 'concept', '', '');
          addLink(rel.attributes.source_name, rel.attributes.target_name, rel.relationship);
        }
      });

      // Connect entity to its anchor concept if entity is not already connected
      const anchorConcept = record.trace?.winning?.anchor_concept;
      if (record.evidence?.entity?.name && anchorConcept && record.evidence.entity.name !== anchorConcept) {
        addLink(record.evidence.entity.name, anchorConcept, 'ANCHORED_BY');
      }
    });

    setEntityNames(entityNamesList);

    const validLinks = linkList.filter((link) => nodeMap.has(link.source) && nodeMap.has(link.target));

    const nodeArray = Array.from(nodeMap.values());
    const centerX = GRAPH_LAYOUT.CENTER_X;
    const centerY = GRAPH_LAYOUT.CENTER_Y;
    const radius = calculateGraphRadius(nodeArray.length);

    // For multiple entities, spread main nodes in a row at the center
    const mainNodes = nodeArray.filter((n) => n.isMain || n.type === 'entity');
    const mainNodeSpacing = 250;
    const mainNodesStartX = centerX - ((mainNodes.length - 1) * mainNodeSpacing) / 2;

    const flowNodes: Node<CustomNodeData>[] = nodeArray.map((node, _index) => {
      let x, y;

      if (node.isMain || node.type === 'entity') {
        const mainIndex = mainNodes.findIndex((n) => n.id === node.id);
        x = mainNodesStartX + mainIndex * mainNodeSpacing;
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
          domain: node.domain,
          entityIndex: node.entityIndex,
          entityName: node.entityName
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
    setIsCalculating(false);
  }, [data, records, selectedNode?.id, setNodes, setEdges]);

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
    return Array.from(types).filter((t) => NODE_TYPE_COLORS[t]);
  }, [nodes]);

  if (isCalculating) {
    return <LoaderRelative className="h-full min-h-[600px]" />;
  }

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
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: NODE_TYPE_COLORS[type]}} />
                <span className="text-xs text-foreground capitalize">{type}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="absolute top-4 right-4 z-10">
        <div className="text-xs text-white bg-slate-900/80 px-3 py-1.5 rounded border border-slate-700">
          {hasMultipleEntities ? `${entityNames.length} entities · ` : ''}
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
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: NODE_TYPE_COLORS[selectedNode.type] || NODE_TYPE_COLORS.other}} />
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
