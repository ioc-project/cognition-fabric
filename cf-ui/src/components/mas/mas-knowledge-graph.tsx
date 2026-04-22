'use client';

import {useState} from 'react';
import {useParams, useRouter} from 'next/navigation';
import useSWR from 'swr';
import {masApi} from '@/api/endpoints';
import {useDefaultWorkspace} from '@/hooks/useDefaultWorkspace';
import {routes} from '@/constants/routes';
import {useDarkMode} from './knowledge-graph/use-dark-mode';
import {useCytoscapeGraph} from './knowledge-graph/use-cytoscape-graph';
import {GraphHeader} from './knowledge-graph/graph-header';
import {GraphDetailPanel} from './knowledge-graph/graph-detail-panel';
import {GraphContextMenu} from './knowledge-graph/graph-context-menu';
import {GraphControls} from './knowledge-graph/graph-controls';

export default function MASKnowledgeGraphPage() {
  const router = useRouter();
  const params = useParams();
  const rawMasId = params?.masId as string | string[] | undefined;
  const masId = Array.isArray(rawMasId) ? rawMasId[0] : rawMasId;

  const {defaultWorkspaceId} = useDefaultWorkspace();
  const [showRaw, setShowRaw] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isDark = useDarkMode();

  const {data, error, isLoading} = useSWR(
    defaultWorkspaceId && masId ? ['mas-knowledge-graph', defaultWorkspaceId, masId] : null,
    () => masApi.knowledgeGraph(defaultWorkspaceId!, masId!),
    {revalidateOnFocus: false}
  );

  const graph = useCytoscapeGraph({data, isDark, searchQuery, masId});

  return (
    <div className="flex flex-col h-screen bg-background">
      <GraphHeader
        stats={graph.stats}
        showRaw={showRaw}
        onToggleRaw={() => setShowRaw((v) => !v)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchEnter={graph.handleSearchEnter}
        onExport={graph.handleExport}
        onBack={() => router.push(routes.mas.details(masId!))}
      />

      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">Loading knowledge graph...</div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-destructive">Failed to load knowledge graph.</p>
          </div>
        )}

        {graph.renderError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-destructive">{graph.renderError}</p>
          </div>
        )}

        {!isLoading && !error && data && (
          <div style={{display: showRaw ? 'none' : 'contents'}}>
            <div className="absolute inset-0" style={{right: graph.panelState ? '24rem' : '0'}}>
              <div ref={graph.cyRef} className="w-full h-full" style={{backgroundColor: isDark ? '#0f172a' : '#f8fafc'}} />
            </div>

            {graph.tooltip && (
              <div
                className="fixed z-50 max-w-xs px-2.5 py-1.5 rounded-md bg-popover text-popover-foreground text-xs shadow-md border pointer-events-none -translate-x-1/2 -translate-y-full"
                style={{left: graph.tooltip.x, top: graph.tooltip.y}}
              >
                {graph.tooltip.text}
              </div>
            )}

            {graph.contextMenu && (
              <GraphContextMenu
                contextMenu={graph.contextMenu}
                onFocus={graph.handleContextFocus}
                onHide={graph.handleContextHide}
                onCopy={graph.handleContextCopy}
                onMouseLeave={graph.dismissContextMenu}
              />
            )}

            {graph.panelState && <GraphDetailPanel panelState={graph.panelState} onClose={graph.clearPanel} onSelectNode={graph.selectNode} />}

            <GraphControls
              onZoomIn={graph.handleZoomIn}
              onZoomOut={graph.handleZoomOut}
              onFit={graph.handleFit}
              typeLegend={graph.typeLegend}
              hiddenNodeIds={graph.hiddenNodeIds}
              onRestoreHidden={graph.handleRestoreHidden}
            />
          </div>
        )}

        {!isLoading && !error && data && showRaw && (
          <div className="absolute inset-0 h-full overflow-y-auto p-6 bg-background">
            <pre className="text-xs font-mono bg-muted p-4 rounded-lg whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
          </div>
        )}

        {!isLoading && !error && !data && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No knowledge graph data found for this multi-agentic system.
          </div>
        )}
      </div>
    </div>
  );
}
