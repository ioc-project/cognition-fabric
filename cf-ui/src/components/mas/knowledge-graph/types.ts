export interface ConceptNode {
  id: string;
  name: string;
  attributes: {concept_type?: string};
  description?: string;
}

export interface Relationship {
  id: string;
  node_ids: [string, string];
  relation: string;
  attributes?: {source_name?: string; target_name?: string; summarized_context?: string};
}

export interface TooltipState {
  text: string;
  x: number;
  y: number;
}

export interface NeighborItem {
  id: string;
  name: string;
  relation: string;
  direction: 'in' | 'out';
}

export type PanelState =
  | {
      kind: 'node';
      id: string;
      fullLabel: string;
      conceptType: string;
      description: string;
      neighbors: NeighborItem[];
    }
  | {
      kind: 'edge';
      sourceLabel: string;
      targetLabel: string;
      relation: string;
      context: string;
    };

export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  label: string;
}
