"use client";

import type { ReactNode } from "react";
import { Modal } from "@tarodan/ui";

interface MediaDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Full-viewport media viewer with the same accessible dialog shell as forms.
 * The header and optional controls remain fixed while only the media stage moves.
 */
export default function MediaDialog({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
}: MediaDialogProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      size="full"
      closeLabel={closeLabel}
      className="h-[calc(100dvh-2rem)]"
      bodyClassName="bg-heading p-0"
      footer={footer}
    >
      {children}
    </Modal>
  );
}
