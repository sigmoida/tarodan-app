"use client";

import { useState } from "react";
import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useTranslations } from "next-intl";

export function ForceCancelPaymentModal({
  paymentId,
  onClose,
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");

  const cancel = useAdminMutation(
    () => adminApi.forceCancelPayment(paymentId, reason),
    {
      invalidates: ["payments"],
      successMessage: t("admin.finance.payments.forceCancelSuccess"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.finance.payments.forceCancel")}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-muted">
          {t("admin.finance.payments.forceCancelDescription")}
        </p>
        <Textarea
          label={t("admin.finance.payments.cancelReasonRequired")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={t("admin.finance.payments.cancelReasonPlaceholder")}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => cancel.mutate()}
          confirmLabel={t("admin.finance.payments.forceCancelConfirm")}
          isLoading={cancel.isPending}
          disabled={!reason.trim()}
        />
      </div>
    </Modal>
  );
}
