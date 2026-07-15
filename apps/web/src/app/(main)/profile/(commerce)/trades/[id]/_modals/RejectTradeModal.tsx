/** @format */

import { Button, Modal, Textarea } from "@tarodan/ui";
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
      maxWidth="max-w-md"
    >
      <Textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder={t("trade.rejectReasonPlaceholder")}
        rows={4}
        className="mb-4"
      />
      <div className="flex gap-3">
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={onClose}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="danger"
          size="md"
          className="flex-1"
          onClick={onReject}
          disabled={isActionLoading}
        >
          {isActionLoading ? t("trade.rejecting") : t("trade.rejectTrade")}
        </Button>
      </div>
    </Modal>
  );
}
