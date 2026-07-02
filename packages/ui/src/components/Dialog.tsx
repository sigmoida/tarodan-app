'use client';

import React, { useCallback } from 'react';
import { Modal, type ModalProps } from './Modal';
import { Button } from './Button';

/** Dialog is an alias for Modal — same API, clearer name when used as a task dialog. */
export const Dialog = Modal;
export type DialogProps = ModalProps;

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use danger styling for destructive confirmations. */
  destructive?: boolean;
  /** While true, confirm button shows a spinner and is disabled. */
  isLoading?: boolean;
}

/**
 * Pre-built confirmation dialog. Wraps Modal with a standard
 * "title / description / cancel / confirm" layout.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Emin misiniz?',
  description,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  destructive,
  isLoading,
}) => {
  const handleConfirm = useCallback(async () => {
    await onConfirm();
  }, [onConfirm]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
      {description && <p className="mb-5 text-sm text-body">{description}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={handleConfirm}
          isLoading={isLoading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};
