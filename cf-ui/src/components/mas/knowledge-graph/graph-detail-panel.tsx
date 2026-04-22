'use client';

import {X, ArrowRight, ArrowLeft as ArrowLeftIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {PanelState, NeighborItem} from './types';
import {NODE_COLOR} from './utils';

interface GraphDetailPanelProps {
  panelState: PanelState;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}

export function GraphDetailPanel({panelState, onClose, onSelectNode}: GraphDetailPanelProps) {
  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-background border-l shadow-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <span className="text-sm font-semibold truncate pr-2">{panelState.kind === 'node' ? panelState.fullLabel : panelState.relation}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {panelState.kind === 'node' && (
          <>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Type</p>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white capitalize"
                style={{backgroundColor: NODE_COLOR}}
              >
                {panelState.conceptType.replace('_', ' ')}
              </span>
            </div>

            {panelState.description && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-sm text-foreground leading-relaxed">{panelState.description}</p>
              </div>
            )}

            {panelState.neighbors.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Connections ({panelState.neighbors.length})</p>
                <div className="space-y-1">
                  {panelState.neighbors.map((n: NeighborItem, i: number) => (
                    <button
                      key={i}
                      onClick={() => onSelectNode(n.id)}
                      className="w-full flex items-start gap-2 text-xs text-left rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                    >
                      {n.direction === 'out' ? (
                        <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-500" />
                      ) : (
                        <ArrowLeftIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-purple-500" />
                      )}
                      <div className="min-w-0">
                        <span className="font-medium text-foreground break-words">{n.name}</span>
                        <span className="block text-muted-foreground italic">{n.relation}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {panelState.kind === 'edge' && (
          <>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Relationship</p>
              <div className="flex items-center gap-1.5 text-sm flex-wrap">
                <span className="font-medium text-foreground">{panelState.sourceLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-foreground">{panelState.targetLabel}</span>
              </div>
              <span className="mt-1 inline-block text-xs text-muted-foreground italic">{panelState.relation}</span>
            </div>

            {panelState.context && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Context</p>
                <p className="text-sm text-foreground leading-relaxed">{panelState.context}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
