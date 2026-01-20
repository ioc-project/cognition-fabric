'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {TraceTimeline} from './trace-timeline';
import {DetailsPanel} from './details-panel';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import type {ReasoningHistoryResponse, ReasoningHistoryContent} from '@/api/types/reasoning-history';
import {VIEWER_LAYOUT} from '@/constants/reasoning-history';

// Dynamically import NetworkGraph to avoid SSR issues with @xyflow/react
const NetworkGraph = dynamic(() => import('./network-graph').then((mod) => mod.NetworkGraph), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-muted-foreground">Loading graph...</div>
});

export type ViewMode = 'graph' | 'trace' | 'details';

interface SelectedNodeInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  domain: string;
}

interface Props {
  data: ReasoningHistoryResponse;
  viewMode: ViewMode;
}

export function ReasoningHistoryViewer({data, viewMode}: Props) {
  const [selectedNode, setSelectedNode] = React.useState<SelectedNodeInfo | null>(null);
  const [selectedEntityIndex, setSelectedEntityIndex] = React.useState(0);

  // Temp to handle both the eventual response structure after the evidence gathering PR is merged and what the server is currently returning.
  const records = data.records?.map((r) => r.content) || [];
  const hasMultipleEntities = records.length > 1;

  const isNewFormat = data.records?.[0]?.content && 'entities' in data.records[0].content;

  const getEntityName = (content: ReasoningHistoryContent | any) => {
    if (isNewFormat) {
      return `Entity ${selectedEntityIndex + 1}`;
    }
    return content?.evidence?.entity?.name || content?.trace?.extracted_entity || 'Unknown Entity';
  };

  const renderContent = (record: ReasoningHistoryContent | undefined, allRecords?: ReasoningHistoryContent[]) => {
    if (!record && !allRecords) {
      return <div className="flex items-center justify-center h-full text-muted-foreground">No data available</div>;
    }

    return (
      <>
        {viewMode === 'graph' && <NetworkGraph data={allRecords || record!} onNodeSelect={setSelectedNode} selectedNode={selectedNode} />}
        {viewMode === 'trace' && <TraceTimeline trace={record?.trace} evidence={record?.evidence} />}
        {viewMode === 'details' && <DetailsPanel data={record!} />}
      </>
    );
  };

  // For graph view with multiple entities, show unified graph
  if (viewMode === 'graph' && hasMultipleEntities) {
    return (
      <div
        className="flex flex-col border border-border rounded-lg bg-background overflow-hidden"
        style={{
          height: `calc(100vh - ${VIEWER_LAYOUT.HEADER_OFFSET_PX}px)`,
          minHeight: `${VIEWER_LAYOUT.MIN_HEIGHT_PX}px`
        }}
      >
        <NetworkGraph data={records} onNodeSelect={setSelectedNode} selectedNode={selectedNode} />
      </div>
    );
  }

  if (!hasMultipleEntities) {
    // Single entity - render directly
    return (
      <div
        className="flex flex-col border border-border rounded-lg bg-background overflow-hidden"
        style={{
          height: `calc(100vh - ${VIEWER_LAYOUT.HEADER_OFFSET_PX}px)`,
          minHeight: `${VIEWER_LAYOUT.MIN_HEIGHT_PX}px`
        }}
      >
        {renderContent(records[0])}
      </div>
    );
  }

  // Multiple entities - show entity tabs
  return (
    <div
      className="flex flex-col border border-border rounded-lg bg-background overflow-hidden"
      style={{
        height: `calc(100vh - ${VIEWER_LAYOUT.HEADER_OFFSET_PX}px)`,
        minHeight: `${VIEWER_LAYOUT.MIN_HEIGHT_PX}px`
      }}
    >
      <Tabs value={selectedEntityIndex.toString()} onValueChange={(val) => setSelectedEntityIndex(parseInt(val))} className="flex flex-col h-full">
        <div className="border-b border-border px-4 pt-3 bg-muted/30">
          <TabsList className="w-full justify-start h-auto p-0 bg-transparent">
            {records.map((record, index) => (
              <TabsTrigger
                key={index}
                value={index.toString()}
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2 rounded-t-md"
              >
                <span className="font-medium">{getEntityName(record)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {records.map((record, index) => (
          <TabsContent key={index} value={index.toString()} className="flex-1 m-0 overflow-hidden">
            {renderContent(record)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
