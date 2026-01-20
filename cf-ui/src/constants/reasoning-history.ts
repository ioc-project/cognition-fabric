/**
 * Constants for reasoning history visualization components
 */

// Graph layout configuration
export const GRAPH_LAYOUT = {
  CENTER_X: 400,
  CENTER_Y: 300,
  MIN_RADIUS: 200,
  RADIUS_PER_NODE: 30,
  MIN_HEIGHT: 600
} as const;

/**
 * Calculate the radius for circular node layout based on node count
 */
export function calculateGraphRadius(nodeCount: number): number {
  return Math.max(GRAPH_LAYOUT.MIN_RADIUS, nodeCount * GRAPH_LAYOUT.RADIUS_PER_NODE);
}

// Viewer container configuration
export const VIEWER_LAYOUT = {
  HEADER_OFFSET_PX: 350,
  MIN_HEIGHT_PX: 500
} as const;

// Trace timeline configuration
export const TRACE_TIMELINE = {
  DEFAULT_EXPANDED_SECTIONS: ['top_similar', 'iteration-1', 'item-1-0'] as const,
  INDENT_PER_LEVEL: 24
} as const;

export const NODE_TYPE_COLORS: Record<string, string> = {
  concept: '#3b82f6',
  entity: '#3b82f6',
  other: '#64748b'
} as const;
