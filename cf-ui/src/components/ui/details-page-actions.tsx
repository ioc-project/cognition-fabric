import {Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';

interface DetailsPageActionsProps {
  onDelete?: () => void;
  onEdit?: () => void;
  isEditMode?: boolean;
  onSave?: () => void;
  onCancelEdit?: () => void;
  isSaving?: boolean;
  deleteLabel?: string;
}

export function DetailsPageActions({
  onDelete,
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
    <div className="flex gap-2">
      {onEdit && (
        <Button variant="sidebar" size="sm" onClick={onEdit}>
          Edit
        </Button>
      )}
      {onDelete && (
        <Button variant="outline" size="sm" onClick={onDelete}>
          {deleteLabel ? deleteLabel : <Trash2 className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
