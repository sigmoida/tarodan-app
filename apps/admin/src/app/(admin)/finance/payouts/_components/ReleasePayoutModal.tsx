"use client";

import { useState } from "react";
import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

export function ReleasePayoutModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  const release = useAdminMutation(
    () => adminApi.releasePayout(orderId, reason.trim()),
    {
      invalidates: ["payouts-transactions", "payouts-summary"],
      successMessage: t("admin.finance.payouts.releasedToSeller"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.finance.payouts.release")}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-muted">
          {t("admin.finance.payouts.releaseDescription")}
        </p>
        <Textarea
          label={t("admin.finance.payouts.releaseReason")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t("admin.finance.payouts.releaseReasonPlaceholder")}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => release.mutate()}
          confirmLabel={t("admin.finance.payouts.release")}
          isLoading={release.isPending}
          disabled={!reason.trim()}
        />
      </div>
    </Modal>
  );
}
