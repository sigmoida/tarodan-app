/** @format */

import { Button, Modal, Textarea } from "@tarodan/ui";

interface RejectTradeModalProps {
  open: boolean;
  onClose: () => void;
  reason: string;
  onReasonChange: (v: string) => void;
  onReject: () => void;
  isActionLoading: boolean;
  locale: string;
  cancelLabel: string;
}

export default function RejectTradeModal({
  open,
  onClose,
  reason,
  onReasonChange,
  onReject,
  isActionLoading,
  locale,
  cancelLabel,
}: RejectTradeModalProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={locale === "en" ? "Reject Trade" : "Takası Reddet"}
      maxWidth="max-w-md"
    >
      <Textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder={
          locale === "en"
            ? "Rejection reason (optional)"
            : "Red nedeni (opsiyonel)"
        }
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
          {isActionLoading
            ? locale === "en"
              ? "Rejecting..."
              : "Reddediliyor..."
            : locale === "en"
              ? "Reject"
              : "Reddet"}
        </Button>
      </div>
    </Modal>
  );
}
