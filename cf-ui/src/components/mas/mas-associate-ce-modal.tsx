// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Check} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import type {CognitionEngineListItem} from '@/api/endpoints/cognition-engine';

interface MASAssociateCEModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableCEs: CognitionEngineListItem[];
  selectedCEIds: string[];
  setSelectedCEIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  isAssociating: boolean;
  onAssociate: () => void;
}

export function MASAssociateCEModal({
  open,
  onOpenChange,
  availableCEs,
  selectedCEIds,
  setSelectedCEIds,
  isAssociating,
  onAssociate
}: MASAssociateCEModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelectedCEIds([]);
        }
        onOpenChange(o);
      }}
      title="Associate Cognition Engines"
      description="Select one or more Cognition Engines to associate with this Multi-Agentic System."
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setSelectedCEIds([]);
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="sidebar" disabled={selectedCEIds.length === 0 || isAssociating} onClick={onAssociate}>
            {isAssociating ? 'Associating...' : `Associate${selectedCEIds.length > 0 ? ` (${selectedCEIds.length})` : ''}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {availableCEs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">All available Cognition Engines are already associated.</p>
        ) : (
          availableCEs.map((ce) => {
            const isSelected = selectedCEIds.includes(ce.id);
            return (
              <div
                key={ce.id}
                className={`flex items-center justify-between rounded-md border px-4 py-3 cursor-pointer transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                }`}
                onClick={() => setSelectedCEIds((prev) => (isSelected ? prev.filter((id) => id !== ce.id) : [...prev, ce.id]))}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-primary bg-primary' : 'border-input'}`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium font-mono">{ce.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">v{ce.version}</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{ce.ce_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={ce.status === 'online' ? 'success' : 'inactive'}>{ce.status === 'online' ? 'Online' : 'Offline'}</Badge>
                  <Badge variant={ce.enabled ? 'info' : 'inactive'}>{ce.enabled ? 'Enabled' : 'Disabled'}</Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
