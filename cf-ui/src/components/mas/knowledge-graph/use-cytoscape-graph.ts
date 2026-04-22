import {useEffect, useRef, useState, useCallback} from 'react';
import cytoscape from 'cytoscape';
import type {TooltipState, PanelState, NeighborItem, ContextMenuState} from './types';
import {NODE_COLOR, NODE_COLOR_BORDER, NODE_SIZE, generateTypeColorMap, buildElements} from './utils';

interface UseCytoscapeGraphOptions {
  data: unknown;
  isDark: boolean;
  searchQuery: string;
  masId: string | undefined;
}

interface UseCytoscapeGraphResult {
  cyRef: React.RefObject<HTMLDivElement | null>;
  stats: {nodes: number; edges: number} | null;
  renderError: string | null;
  typeLegend: {type: string; color: string}[];
  tooltip: TooltipState | null;
  panelState: PanelState | null;
  contextMenu: ContextMenuState | null;
  hiddenNodeIds: Set<string>;
  selectNode: (nodeId: string) => void;
  clearPanel: () => void;
  handleExport: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleFit: () => void;
  handleContextFocus: () => void;
  handleContextHide: () => void;
  handleContextCopy: () => void;
  handleRestoreHidden: () => void;
  handleSearchEnter: () => void;
  dismissContextMenu: () => void;
}

export function useCytoscapeGraph({data, isDark, searchQuery, masId}: UseCytoscapeGraphOptions): UseCytoscapeGraphResult {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);
  const [stats, setStats] = useState<{nodes: number; edges: number} | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [typeLegend, setTypeLegend] = useState<{type: string; color: string}[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [panelState, setPanelState] = useState<PanelState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());

  const selectNode = useCallback((nodeId: string) => {
    const cy = cyInstance.current;
    if (!cy) {
      return;
    }

    const node = cy.getElementById(nodeId);
    if (node.empty()) {
      return;
    }

    const neighbors: NeighborItem[] = [];
    node.outgoers('edge').forEach((edge: cytoscape.EdgeSingular) => {
      neighbors.push({
        id: edge.target().id(),
        name: edge.target().data('fullLabel') as string,
        relation: edge.data('label') as string,
        direction: 'out'
      });
    });
    node.incomers('edge').forEach((edge: cytoscape.EdgeSingular) => {
      neighbors.push({
        id: edge.source().id(),
        name: edge.source().data('fullLabel') as string,
        relation: edge.data('label') as string,
        direction: 'in'
      });
    });

    setPanelState({
      kind: 'node',
      id: nodeId,
      fullLabel: node.data('fullLabel') as string,
      conceptType: node.data('concept_type') as string,
      description: node.data('description') as string,
      neighbors
    });

    cy.elements().addClass('faded').removeClass('neighborhood-focus highlighted');
    node.removeClass('faded').addClass('neighborhood-focus');
    node.neighborhood().removeClass('faded').addClass('neighborhood-focus');
    cy.animate({center: {eles: node}, duration: 250} as cytoscape.AnimateOptions);
  }, []);

  // Cytoscape initialization
  useEffect(() => {
    if (!data || !cyRef.current) {
      return;
    }

    try {
      const edgeColor = isDark ? '#94a3b8' : '#64748b';
      const edgeLabelBg = isDark ? '#1e293b' : '#f8fafc';
      const selectedNodeBorder = isDark ? '#818cf8' : '#1e1b4b';

      const elements = buildElements(data as Record<string, unknown>);
      const nodeCount = elements.filter((el) => !el.data.source).length;
      const edgeCount = elements.filter((el) => !!el.data.source).length;

      const uniqueTypes = Array.from(
        new Set(elements.filter((el) => !el.data.source && el.data.concept_type).map((el) => el.data.concept_type as string))
      ).sort();
      const typeColorMap = generateTypeColorMap(uniqueTypes);
      const typeStyleEntries: cytoscape.StylesheetStyle[] = uniqueTypes.map((t) => ({
        selector: `node[concept_type = "${t}"]`,
        style: {
          'background-color': typeColorMap.get(t)!.fill,
          'border-color': typeColorMap.get(t)!.border
        }
      }));
      setTypeLegend(uniqueTypes.map((t) => ({type: t, color: typeColorMap.get(t)!.fill})));

      if (cyInstance.current) {
        cyInstance.current.destroy();
      }

      const cy = cytoscape({
        container: cyRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(labelDisplay)',
              'background-color': NODE_COLOR,
              color: '#fff',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '11px',
              'font-family': 'ui-sans-serif, system-ui, sans-serif',
              'font-weight': 500,
              shape: 'ellipse',
              width: NODE_SIZE,
              height: NODE_SIZE,
              'text-wrap': 'wrap',
              'text-max-width': `${NODE_SIZE - 8}px`,
              'border-width': 2,
              'border-color': NODE_COLOR_BORDER,
              padding: '0px'
            }
          },
          {
            selector: 'edge',
            style: {
              label: 'data(label)',
              'line-color': '#94a3b8',
              'target-arrow-color': '#94a3b8',
              'target-arrow-shape': 'triangle-backcurve',
              'arrow-scale': 0.7,
              'curve-style': 'bezier',
              'font-size': '10px',
              'font-family': 'ui-sans-serif, system-ui, sans-serif',
              color: edgeColor,
              'text-background-color': edgeLabelBg,
              'text-background-opacity': 1,
              'text-background-padding': '2px',
              'text-border-width': 0,
              'text-margin-y': -8,
              'text-wrap': 'ellipsis',
              'text-max-width': '80px',
              width: 1.5,
              'text-events': 'yes'
            }
          },
          {
            selector: 'node:selected',
            style: {'border-width': 4, 'border-color': selectedNodeBorder}
          },
          {
            selector: 'edge:selected',
            style: {'line-color': '#7c3aed', 'target-arrow-color': '#7c3aed', 'target-arrow-shape': 'triangle-backcurve', width: 3}
          },
          {
            selector: 'node.faded, edge.faded',
            style: {opacity: 0.12}
          },
          {
            selector: 'node.highlighted',
            style: {'border-width': 4, 'border-color': '#f59e0b'}
          },
          {
            selector: 'node.neighborhood-focus',
            style: {'border-width': 3, 'border-color': '#fff', 'z-index': 999}
          },
          {
            selector: 'edge.neighborhood-focus',
            style: {'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8', width: 2, 'z-index': 999}
          },
          ...typeStyleEntries
        ],
        layout: {
          name: elements.length > 0 ? 'cose' : 'null',
          animate: false,
          padding: 80,
          nodeRepulsion: () => 600000,
          idealEdgeLength: () => 120,
          edgeElasticity: () => 80,
          gravity: 50,
          numIter: 2500,
          nodeDimensionsIncludeLabels: false
        } as cytoscape.LayoutOptions
      });

      cy.on('mouseover', 'node', (e) => {
        const node = e.target as cytoscape.NodeSingular;
        const pos = node.renderedPosition();
        const rect = cyRef.current!.getBoundingClientRect();
        const bb = node.renderedBoundingBox();
        setTooltip({text: node.data('fullLabel') as string, x: rect.left + pos.x, y: rect.top + bb.y1 - 8});
      });
      cy.on('mouseout', 'node', () => setTooltip(null));

      cy.on('mouseover', 'edge', (e) => {
        const edge = e.target as cytoscape.EdgeSingular;
        const context = edge.data('context') as string;
        if (!context) {
          return;
        }
        const pos = e.renderedPosition ?? edge.midpoint();
        const rect = cyRef.current!.getBoundingClientRect();
        setTooltip({
          text: context,
          x: rect.left + (pos as {x: number; y: number}).x,
          y: rect.top + (pos as {x: number; y: number}).y - 12
        });
      });
      cy.on('mouseout', 'edge', () => setTooltip(null));

      cy.on('pan zoom', () => {
        setTooltip(null);
        setContextMenu(null);
      });

      cy.on('tap', 'node', (e) => {
        setTooltip(null);
        setContextMenu(null);
        selectNode((e.target as cytoscape.NodeSingular).id());
      });

      cy.on('tap', 'edge', (e) => {
        setTooltip(null);
        setContextMenu(null);
        const edge = e.target as cytoscape.EdgeSingular;
        setPanelState({
          kind: 'edge',
          sourceLabel: edge.source().data('fullLabel') as string,
          targetLabel: edge.target().data('fullLabel') as string,
          relation: edge.data('label') as string,
          context: edge.data('context') as string
        });
        cy.elements().addClass('faded').removeClass('neighborhood-focus highlighted');
        edge.removeClass('faded').addClass('neighborhood-focus');
        edge.source().removeClass('faded').addClass('neighborhood-focus');
        edge.target().removeClass('faded').addClass('neighborhood-focus');
      });

      cy.on('tap', (e) => {
        if (e.target === cy) {
          cy.elements().removeClass('faded neighborhood-focus highlighted');
          cy.animate({fit: {eles: cy.elements(), padding: 40}, duration: 300} as cytoscape.AnimateOptions);
          setPanelState(null);
          setContextMenu(null);
        }
      });

      cy.on('cxttap', 'node', (e) => {
        e.preventDefault();
        const node = e.target as cytoscape.NodeSingular;
        const pos = e.renderedPosition as {x: number; y: number};
        const rect = cyRef.current!.getBoundingClientRect();
        setTooltip(null);
        setContextMenu({
          x: rect.left + pos.x,
          y: rect.top + pos.y,
          nodeId: node.id(),
          label: node.data('fullLabel') as string
        });
      });

      cyInstance.current = cy;
      setStats({nodes: nodeCount, edges: edgeCount});
    } catch {
      setRenderError('Failed to render the knowledge graph.');
    }

    return () => {
      cyInstance.current?.destroy();
      cyInstance.current = null;
      setHiddenNodeIds(new Set());
      setTypeLegend([]);
    };
  }, [data, selectNode, isDark]);

  // Search highlight
  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy) {
      return;
    }

    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      cy.elements().removeClass('faded highlighted');
      return;
    }

    setPanelState(null);
    cy.elements().removeClass('neighborhood-focus');

    cy.nodes().forEach((node) => {
      const label = String(node.data('fullLabel') ?? node.data('label') ?? '').toLowerCase();
      const type = String(node.data('concept_type') ?? '')
        .toLowerCase()
        .replace(/_/g, ' ');
      if (label.includes(query) || type.includes(query)) {
        node.removeClass('faded').addClass('highlighted');
        node.connectedEdges().removeClass('faded');
      } else {
        node.removeClass('highlighted').addClass('faded');
      }
    });

    cy.edges().forEach((edge) => {
      if (!edge.source().hasClass('highlighted') && !edge.target().hasClass('highlighted')) {
        edge.addClass('faded');
      }
    });
  }, [searchQuery]);

  // Resize canvas when panel opens/closes
  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy) {
      return;
    }
    const timer = setTimeout(() => cy.resize(), 0);
    return () => clearTimeout(timer);
  }, [panelState]);

  const clearPanel = useCallback(() => {
    const cy = cyInstance.current;
    if (cy) {
      cy.elements().removeClass('faded neighborhood-focus highlighted');
      cy.animate({fit: {eles: cy.elements(), padding: 40}, duration: 300} as cytoscape.AnimateOptions);
    }
    setPanelState(null);
  }, []);

  const handleExport = useCallback(() => {
    const cy = cyInstance.current;
    if (!cy) {
      return;
    }
    const uri = cy.png({output: 'base64uri', bg: isDark ? '#0f172a' : '#f8fafc', full: true, scale: 2});
    const a = document.createElement('a');
    a.href = uri as string;
    a.download = `knowledge-graph-${masId ?? 'export'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [masId, isDark]);

  const handleZoomIn = useCallback(() => cyInstance.current?.zoom(cyInstance.current.zoom() * 1.2), []);
  const handleZoomOut = useCallback(() => cyInstance.current?.zoom(cyInstance.current.zoom() * 0.8), []);
  const handleFit = useCallback(() => cyInstance.current?.fit(undefined, 40), []);

  const handleContextFocus = useCallback(() => {
    if (!contextMenu) {
      return;
    }
    selectNode(contextMenu.nodeId);
    setContextMenu(null);
  }, [contextMenu, selectNode]);

  const handleContextHide = useCallback(() => {
    if (!contextMenu) {
      return;
    }
    const cy = cyInstance.current;
    if (cy) {
      cy.getElementById(contextMenu.nodeId).style({display: 'none'});
    }
    setHiddenNodeIds((prev) => new Set(prev).add(contextMenu.nodeId));
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextCopy = useCallback(() => {
    if (!contextMenu) {
      return;
    }
    navigator.clipboard.writeText(contextMenu.label).catch(() => {});
    setContextMenu(null);
  }, [contextMenu]);

  const handleRestoreHidden = useCallback(() => {
    const cy = cyInstance.current;
    if (!cy) {
      return;
    }
    hiddenNodeIds.forEach((id) => cy.getElementById(id).style({display: 'element'}));
    setHiddenNodeIds(new Set());
  }, [hiddenNodeIds]);

  const handleSearchEnter = useCallback(() => {
    const cy = cyInstance.current;
    if (!cy) {
      return;
    }
    const matches = cy.nodes('.highlighted');
    if (matches.length > 0) {
      cy.animate({fit: {eles: matches, padding: 60}, duration: 300} as cytoscape.AnimateOptions);
    }
  }, []);

  const dismissContextMenu = useCallback(() => setContextMenu(null), []);

  return {
    cyRef,
    stats,
    renderError,
    typeLegend,
    tooltip,
    panelState,
    contextMenu,
    hiddenNodeIds,
    selectNode,
    clearPanel,
    handleExport,
    handleZoomIn,
    handleZoomOut,
    handleFit,
    handleContextFocus,
    handleContextHide,
    handleContextCopy,
    handleRestoreHidden,
    handleSearchEnter,
    dismissContextMenu
  };
}
