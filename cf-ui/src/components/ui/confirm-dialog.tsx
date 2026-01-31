import {AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
  disableCancelDuringProcessing?: boolean;
  closeOnConfirmSuccess?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
  disableCancelDuringProcessing = false,
  closeOnConfirmSuccess = true
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    try {
      await onConfirm();
      if (closeOnConfirmSuccess) {
        onOpenChange(false);
      }
    } catch {}
  };

  const footer = (
    <div className="flex w-full items-center justify-end gap-3">
      <Button
        variant="outline"
        onClick={() => {
          onCancel?.();
          onOpenChange(false);
        }}
        disabled={disableCancelDuringProcessing && !!loading}
      >
        {cancelText}
      </Button>
      <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={handleConfirm} disabled={loading}>
        {loading ? 'Processing...' : confirmText}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={
        variant === 'destructive' ? (
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-2">
            <AlertTriangle aria-hidden="true" className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
        ) : undefined
      }
      footer={footer}
    />
  );
}
