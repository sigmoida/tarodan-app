/** @format */

import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";

interface RejectTradeModalProps {
  open: boolean;
  onClose: () => void;
  reason: string;
  onReasonChange: (v: string) => void;
  onReject: () => void;
  isActionLoading: boolean;
  cancelLabel: string;
}

export default function RejectTradeModal({
  open,
  onClose,
  reason,
  onReasonChange,
  onReject,
  isActionLoading,
  cancelLabel,
}: RejectTradeModalProps) {
  const t = useTranslations();
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("trade.rejectTradeTitle")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={isActionLoading}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onReject}
          cancelLabel={cancelLabel}
          confirmLabel={
            isActionLoading ? t("trade.rejecting") : t("trade.rejectTrade")
          }
          destructive
          isLoading={isActionLoading}
        />
      }
    >
      <Textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder={t("trade.rejectReasonPlaceholder")}
        rows={4}
        className="w-full"
      />
    </Modal>
  );
}
