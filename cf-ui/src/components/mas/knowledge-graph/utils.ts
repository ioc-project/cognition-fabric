import cytoscape from 'cytoscape';
import type {ConceptNode, Relationship} from './types';

export const NODE_COLOR = '#3b82f6';
export const NODE_COLOR_BORDER = '#2563eb';
export const NODE_SIZE = 90;

export function generateTypeColorMap(types: string[]): Map<string, {fill: string; border: string}> {
  const n = types.length || 1;
  return new Map(
    types.map((t, i) => {
      const hue = Math.round((i * 360) / n);
      return [t, {fill: `hsl(${hue}, 65%, 55%)`, border: `hsl(${hue}, 65%, 40%)`}];
    })
  );
}

export function makeDisplayLabel(name: string): string {
  const display = name.replace(/[_-]/g, ' ');
  if (display.length <= 50) {
    return display;
  }
  const cut = display.substring(0, 38);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.substring(0, lastSpace) : cut) + '...';
}

export function buildElements(raw: Record<string, unknown>): cytoscape.ElementDefinition[] {
  if (Array.isArray(raw.elements)) {
    return raw.elements as cytoscape.ElementDefinition[];
  }

  if (raw.nodes || raw.edges) {
    const nodes = (raw.nodes as cytoscape.ElementDefinition[]) ?? [];
    const edges = (raw.edges as cytoscape.ElementDefinition[]) ?? [];
    return [...nodes, ...edges];
  }

  const records = (raw.records ?? raw.results ?? raw.data ?? []) as Record<string, unknown>[];
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const firstRecord = records[0] as Record<string, unknown>;

  if (Array.isArray(firstRecord.concepts) && Array.isArray(firstRecord.relationships)) {
    const concepts = firstRecord.concepts as ConceptNode[];
    const relationships = firstRecord.relationships as Relationship[];

    const nodes: cytoscape.ElementDefinition[] = concepts.map((c) => ({
      data: {
        id: c.id,
        label: c.name,
        labelDisplay: makeDisplayLabel(c.name),
        fullLabel: c.name,
        concept_type: c.attributes?.concept_type ?? 'other_concept',
        description: c.description ?? ''
      }
    }));

    const edges: cytoscape.ElementDefinition[] = relationships.map((r) => ({
      data: {
        id: r.id,
        source: r.node_ids[0],
        target: r.node_ids[1],
        label: r.relation,
        context: r.attributes?.summarized_context ?? ''
      }
    }));

    return [...nodes, ...edges];
  }

  const nodeIds = new Set<string>();
  const nodeElements: cytoscape.ElementDefinition[] = [];
  const edgeElements: cytoscape.ElementDefinition[] = [];

  records.forEach((record, i) => {
    const src = String(record.source ?? record.from ?? record.subject ?? '').trim();
    const dst = String(record.destination ?? record.target ?? record.to ?? record.object ?? '').trim();
    const rel = String(record.relation ?? record.relationship ?? record.predicate ?? record.type ?? record.label ?? '').trim();

    if (!src || !dst) {
      return;
    }

    if (!nodeIds.has(src)) {
      nodeIds.add(src);
      nodeElements.push({data: {id: src, label: src, fullLabel: src}});
    }
    if (!nodeIds.has(dst)) {
      nodeIds.add(dst);
      nodeElements.push({data: {id: dst, label: dst, fullLabel: dst}});
    }

    edgeElements.push({data: {id: `e${i}`, source: src, target: dst, label: rel}});
  });

  return [...nodeElements, ...edgeElements];
}
