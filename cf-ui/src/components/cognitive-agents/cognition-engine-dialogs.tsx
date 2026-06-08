'use client';

import {AlertTriangle, Unlink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';
import type {ToggleStep} from '@/hooks/useCEToggleFlow';
import type {DeleteStep} from '@/hooks/useCEDeleteFlow';

export interface CognitionEngineDialogsProps {
  // Toggle flow
  toggleCeName: string | undefined;
  toggleCeEnabled: boolean | undefined;
  toggleStep: ToggleStep;
  setToggleStep: (step: ToggleStep) => void;
  toggleAssociatedMas: MultiAgenticSystem[];
  toggleDisassociatedIds: Set<string>;
  toggleDisassociatingIds: Set<string>;
  togglePendingMas: MultiAgenticSystem[];
  onToggleDisassociate: (mas: MultiAgenticSystem) => void;
  onConfirmToggle: () => void;
  isTogglingEnabled: boolean;
  // Delete flow
  deleteCeName: string | undefined;
  deleteStep: DeleteStep;
  setDeleteStep: (step: DeleteStep) => void;
  setDisableError: (err: string | null) => void;
  setDeleteError: (err: string | null) => void;
  hasDisabled: boolean;
  associatedMas: MultiAgenticSystem[];
  disassociatedIds: Set<string>;
  disassociatingIds: Set<string>;
  pendingMas: MultiAgenticSystem[];
  onDisassociate: (mas: MultiAgenticSystem) => void;
  onDisable: () => void;
  onDelete: () => void;
  isDisabling: boolean;
  isDeleting: boolean;
  disableError: string | null;
  deleteError: string | null;
}

export function CognitionEngineDialogs({
  toggleCeName,
  toggleCeEnabled,
  toggleStep,
  setToggleStep,
  toggleAssociatedMas,
  toggleDisassociatedIds,
  toggleDisassociatingIds,
  togglePendingMas,
  onToggleDisassociate,
  onConfirmToggle,
  isTogglingEnabled,
  deleteCeName,
  deleteStep,
  setDeleteStep,
  setDisableError,
  setDeleteError,
  hasDisabled,
  associatedMas,
  disassociatedIds,
  disassociatingIds,
  pendingMas,
  onDisassociate,
  onDisable,
  onDelete,
  isDisabling,
  isDeleting,
  disableError,
  deleteError
}: CognitionEngineDialogsProps) {
  return (
    <>
      {/* Toggle — Disassociate MAS first */}
      <Modal
        open={toggleStep === 'disassociate'}
        onOpenChange={(open) => {
          if (!open) {
            setToggleStep(null);
          }
        }}
        title="Remove MAS Associations"
        description={`"${toggleCeName}" must be disassociated from all Multi-Agentic Systems before it can be disabled.`}
        icon={
          <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/20 p-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
        }
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setToggleStep(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={togglePendingMas.length > 0} onClick={() => setToggleStep('confirm')}>
              Disable
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {toggleAssociatedMas.map((mas) => {
            const disassociated = toggleDisassociatedIds.has(mas.id);
            const disassociating = toggleDisassociatingIds.has(mas.id);
            return (
              <div key={mas.id} className="flex items-center justify-between rounded-md border px-4 py-3">
                <span className={`text-sm font-medium ${disassociated ? 'line-through text-muted-foreground' : ''}`}>{mas.name}</span>
                {disassociated ? (
                  <span className="text-xs text-muted-foreground">Disassociated</span>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2" disabled={disassociating} onClick={() => onToggleDisassociate(mas)}>
                    <Unlink className="w-3 h-3" />
                    {disassociating ? 'Removing...' : 'Disassociate'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Toggle — Confirm disable/enable */}
      <ConfirmDialog
        open={toggleStep === 'confirm'}
        onOpenChange={(open) => {
          if (!open) {
            setToggleStep(null);
          }
        }}
        onConfirm={onConfirmToggle}
        title={toggleCeEnabled ? `Disable "${toggleCeName}"` : `Enable "${toggleCeName}"`}
        description={
          toggleCeEnabled
            ? `Disabling "${toggleCeName}" will stop it from receiving new requests. You can re-enable it at any time.`
            : `Enabling "${toggleCeName}" will allow it to start receiving requests.`
        }
        confirmText={toggleCeEnabled ? 'Disable' : 'Enable'}
        loading={isTogglingEnabled}
        variant={toggleCeEnabled ? 'destructive' : 'default'}
      />

      {/* Step 1 — Disable */}
      <ConfirmDialog
        open={deleteStep === 'disable'}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStep(null);
            setDisableError(null);
          }
        }}
        onConfirm={onDisable}
        title={`Disable "${deleteCeName}"`}
        description={
          disableError ??
          `To proceed with deletion, "${deleteCeName}" must first be disabled. This will stop it from receiving new requests. You can re-enable it later if needed.`
        }
        confirmText="Disable"
        loading={isDisabling}
        variant="destructive"
      />

      {/* Step 2 — Disassociate from MAS */}
      <Modal
        open={deleteStep === 'disassociate'}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStep(null);
          }
        }}
        title="Remove MAS Associations"
        description={`"${deleteCeName}" is associated with the following Multi-Agentic Systems. Disassociate from all before deleting.`}
        icon={
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-2">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
        }
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteStep(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pendingMas.length > 0} onClick={() => setDeleteStep('delete')}>
              Proceed to Delete
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {associatedMas.map((mas) => {
            const disassociated = disassociatedIds.has(mas.id);
            const disassociating = disassociatingIds.has(mas.id);
            return (
              <div key={mas.id} className="flex items-center justify-between rounded-md border px-4 py-3">
                <span className={`text-sm font-medium ${disassociated ? 'line-through text-muted-foreground' : ''}`}>{mas.name}</span>
                {disassociated ? (
                  <span className="text-xs text-muted-foreground">Disassociated</span>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2" disabled={disassociating} onClick={() => onDisassociate(mas)}>
                    <Unlink className="w-3 h-3" />
                    {disassociating ? 'Removing...' : 'Disassociate'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Step 3 — Confirm delete */}
      <ConfirmDialog
        open={deleteStep === 'delete'}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStep(null);
            setDeleteError(null);
          }
        }}
        onConfirm={onDelete}
        title={`Delete "${deleteCeName}"`}
        description={
          deleteError ??
          (hasDisabled
            ? `"${deleteCeName}" has been disabled successfully. Permanently delete this Cognition Engine? This action cannot be undone.`
            : `Are you sure you want to permanently delete "${deleteCeName}"? This action cannot be undone.`)
        }
        confirmText="Delete"
        loading={isDeleting}
        variant="destructive"
      />
    </>
  );
}
