'use client';

import React, { useCallback } from 'react';
import { Modal, type ModalProps } from './Modal';
import { Button } from './Button';

/** Dialog is an alias for Modal — same API, clearer name when used as a task dialog. */
export const Dialog = Modal;
export type DialogProps = ModalProps;

export interface ModalFooterProps {
  /** Cancel / dismiss handler. */
  onCancel: () => void;
  /**
   * Primary action handler. Omit inside a `<form>` so the action button acts as
   * the form's `type="submit"` (e.g. FormModal). Provided → a click button.
   */
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  /** Danger styling for the primary action (destructive confirmations). */
  destructive?: boolean;
  /** Explicit primary-action variant (overrides `destructive`); e.g. "success" for approve. */
  confirmVariant?: 'primary' | 'danger' | 'success';
  /** Primary action shows a spinner and both buttons disable. */
  isLoading?: boolean;
  /** Disable the primary action (e.g. empty required field). */
  disabled?: boolean;
}

/**
 * The one shared dialog footer — a right-aligned Cancel + primary action row.
 * Every dialog (Modal-based action modals, FormModal, ConfirmDialog, prompt)
 * renders its buttons through this so the layout/variants stay identical.
 */
export const ModalFooter: React.FC<ModalFooterProps> = ({
  onCancel,
  onConfirm,
  cancelLabel = 'İptal',
  confirmLabel = 'Kaydet',
  destructive = false,
  confirmVariant,
  isLoading = false,
  disabled = false,
}) => (
  <div className="flex items-center justify-end gap-3 pt-2">
    <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
      {cancelLabel}
    </Button>
    <Button
      type={onConfirm ? 'button' : 'submit'}
      variant={confirmVariant ?? (destructive ? 'danger' : 'primary')}
      onClick={onConfirm}
      isLoading={isLoading}
      disabled={disabled}
    >
      {confirmLabel}
    </Button>
  </div>
);

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
      <ModalFooter
        onCancel={onClose}
        onConfirm={handleConfirm}
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        destructive={destructive}
        isLoading={isLoading}
      />
    </Modal>
  );
};
