// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {Trash2} from 'lucide-react';
import {ActionButton} from '@/components/ui/action-button';

interface DetailsPageActionsProps {
  onDelete?: () => void;
  deleteDisabled?: boolean;
  onEdit?: () => void;
  isEditMode?: boolean;
  onSave?: () => void;
  onCancelEdit?: () => void;
  isSaving?: boolean;
  deleteLabel?: string;
}

export function DetailsPageActions({
  onDelete,
  deleteDisabled = false,
  onEdit,
  isEditMode = false,
  onSave,
  onCancelEdit,
  isSaving = false,
  deleteLabel
}: DetailsPageActionsProps) {
  if (isEditMode && onSave && onCancelEdit) {
    return (
      <div className="flex gap-2">
        <ActionButton label="Cancel" onClick={onCancelEdit} disabled={isSaving} />
        <ActionButton label={isSaving ? 'Saving...' : 'Save'} variant="primary" onClick={onSave} disabled={isSaving} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {onEdit && <ActionButton label="Edit" onClick={onEdit} />}
      {onEdit && onDelete && <div className="w-px h-5 bg-border shrink-0" />}
      {onDelete && (
        <ActionButton icon={Trash2} label={deleteLabel} variant="destructive" onClick={onDelete} disabled={deleteDisabled} />
      )}
    </div>
  );
}
