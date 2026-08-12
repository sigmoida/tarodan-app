"use client";

import { useState } from "react";
import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

export function ReleasePayoutModal({
  orderId,
  early = false,
  onClose,
}: {
  orderId: string;
  /** Hold süresi dolmadan (iade penceresi açıkken) bilinçli erken bırakma. */
  early?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  const release = useAdminMutation(
    () => adminApi.releasePayout(orderId, reason.trim(), early),
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
      title={
        early
          ? t("admin.finance.payouts.releaseEarly")
          : t("admin.finance.payouts.release")
      }
      size="md"
      closeButtonDisabled={release.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => release.mutate()}
          confirmLabel={
            early
              ? t("admin.finance.payouts.releaseEarly")
              : t("admin.finance.payouts.release")
          }
          isLoading={release.isPending}
          disabled={!reason.trim()}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-muted">
          {t("admin.finance.payouts.releaseDescription")}
        </p>
        {early && (
          <p className="rounded border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800">
            {t("admin.finance.payouts.earlyReleaseWarning")}
          </p>
        )}
        <Textarea
          label={t("admin.finance.payouts.releaseReason")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t("admin.finance.payouts.releaseReasonPlaceholder")}
        />
      </div>
    </Modal>
  );
}
