// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {ZoomIn, ZoomOut, Maximize2, X} from 'lucide-react';
import {Button} from '@/components/ui/button';

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  typeLegend: {type: string; color: string}[];
  hiddenNodeIds: Set<string>;
  onRestoreHidden: () => void;
}

export function GraphControls({onZoomIn, onZoomOut, onFit, typeLegend, hiddenNodeIds, onRestoreHidden}: GraphControlsProps) {
  return (
    <>
      {typeLegend.length > 0 && (
        <div
          className="absolute top-4 left-4 z-30 rounded-lg border shadow-sm px-3 py-2 flex flex-col gap-1.5"
          style={{backgroundColor: 'hsl(var(--card))'}}
        >
          {typeLegend.map(({type, color}) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: color}} />
              <span className="text-xs text-foreground capitalize">{type.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}

      {hiddenNodeIds.size > 0 && (
        <div className="absolute bottom-6 left-6 z-30">
          <Button variant="outline" size="sm" className="bg-background shadow-sm text-xs gap-1.5" onClick={onRestoreHidden}>
            <X className="w-3 h-3" />
            Restore {hiddenNodeIds.size} hidden node{hiddenNodeIds.size > 1 ? 's' : ''}
          </Button>
        </div>
      )}

      <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-1.5">
        <Button variant="outline" size="icon" className="h-8 w-8 bg-background shadow-sm" onClick={onZoomIn}>
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 bg-background shadow-sm" onClick={onZoomOut}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 bg-background shadow-sm" onClick={onFit}>
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
}
