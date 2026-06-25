// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {ReactNode} from 'react';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  onInteractOutside?: (event: Event | React.SyntheticEvent) => void;
  onOpenAutoFocus?: (event: Event) => void;
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  contentClassName,
  onInteractOutside,
  onOpenAutoFocus
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName} onInteractOutside={onInteractOutside} onOpenAutoFocus={onOpenAutoFocus}>
        {(title || description || icon) && (
          <DialogHeader>
            <div className="flex items-center gap-3">
              {icon}
              {title ? <DialogTitle>{title}</DialogTitle> : null}
            </div>
            {description ? <DialogDescription className="pt-2">{description}</DialogDescription> : null}
          </DialogHeader>
        )}
        {children && <div className="py-4">{children}</div>}
        {footer ? <DialogFooter className="w-full mt-0">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
