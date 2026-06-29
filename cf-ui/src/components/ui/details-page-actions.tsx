// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';

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
        <Button variant="outline" size="sm" onClick={onCancelEdit} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="sidebar" size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {onEdit && (
        <Button variant="sidebar" size="sm" onClick={onEdit}>
          Edit
        </Button>
      )}
      {onEdit && onDelete && <div className="w-px h-5 bg-border shrink-0" />}
      {onDelete && (
        <Button variant="outline-destructive" size="sm" onClick={onDelete} disabled={deleteDisabled}>
          {deleteLabel ? deleteLabel : <Trash2 className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
