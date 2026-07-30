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
 *
 * Sahne AÇIK yüzey (`surface-alt`) — eskiden `bg-heading` ile neredeyse siyahtı
 * ve uygulamanın geri kalanının içinde tek koyu alan olarak duruyordu. Üzerine
 * binen kontroller de buna göre koyu metinli beyaz düğmeler; ters (beyaz)
 * kontroller açık zeminde görünmez olurdu.
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
      bodyClassName="bg-surface-alt p-0"
      footer={footer}
    >
      {children}
    </Modal>
  );
}
