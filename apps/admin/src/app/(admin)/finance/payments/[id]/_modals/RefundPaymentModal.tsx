"use client";

import { useRef, useState } from "react";
import { Modal, ModalFooter, Input, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";

export function RefundPaymentModal({
  paymentId,
  amount,
  onClose,
}: {
  paymentId: string;
  amount: number;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [refundAmount, setRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID()).current;

  const refund = useAdminMutation(
    () =>
      adminApi.manualRefund(paymentId, {
        amount: refundAmount ? parseFloat(refundAmount) : undefined,
        reason: reason || undefined,
        idempotencyKey,
      }),
    {
      invalidates: ["payments"],
      successMessage: t("admin.finance.payments.refundStarted"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.finance.payments.manualRefund")}
      size="md"
      closeButtonDisabled={refund.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => refund.mutate()}
          confirmLabel={t("admin.finance.payments.refundConfirm")}
          destructive
          isLoading={refund.isPending}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-muted">
          {t("admin.finance.payments.totalPaymentAmount")}: {fmtTry(amount)}
        </p>
        <Input
          type="number"
          min="0.01"
          max={amount}
          step="0.01"
          label={t("admin.finance.payments.refundAmountLabel")}
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
          placeholder={t("admin.finance.payments.refundAmountPlaceholder")}
        />
        <Textarea
          label={t("admin.finance.payments.refundReasonLabel")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={t("admin.finance.payments.refundReasonPlaceholder")}
        />
      </div>
    </Modal>
  );
}
