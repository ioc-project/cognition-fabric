'use client';

import {ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  isLoading = false,
  loadingLabel = 'Loading...'
}: FormDialogProps) {
  const footer = (
    <div className="flex w-full items-center justify-between">
      <Button
        variant="outline"
        onClick={() => {
          onCancel?.();
          onOpenChange(false);
        }}
      >
        {cancelLabel}
      </Button>
      <Button onClick={onConfirm} disabled={confirmDisabled || isLoading}>
        {isLoading ? loadingLabel : confirmLabel}
      </Button>
    </div>
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer}>
      <div className="py-4">{children}</div>
    </Modal>
  );
}
