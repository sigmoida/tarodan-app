"use client";

import { FormModal, FormTextarea, useZodForm } from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { toastReleaseFastPath } from "@/components/finance/release-fast-path";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { releasePayoutSchema, type ReleasePayoutValues } from "../_lib/schema";

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
  const form = useZodForm(releasePayoutSchema(t), {
    defaultValues: { reason: "" },
  });
  const release = useAdminMutation(
    (v: ReleasePayoutValues) =>
      adminApi.releasePayout(orderId, v.reason.trim(), early),
    {
      // Fast-path anında bir PayoutTransfer (pending) satırı oluşturur —
      // Transferler sekmesi de tazelenmeli, yoksa satır elle yenileyene
      // kadar görünmez.
      invalidates: [
        "payouts-transactions",
        "payouts-summary",
        "payouts-transfers",
      ],
      successMessage: t("admin.finance.payouts.releasedToSeller"),
      onSuccess: (res) => {
        toastReleaseFastPath(res?.data, {
          queued: t("admin.finance.payouts.transferQueuedInfo"),
          deferred: t("admin.finance.payouts.transferDeferred"),
          fallback: t("admin.finance.payouts.transferQueueFallback"),
        });
        onClose();
      },
    },
  );

  return (
    <FormModal
      open
      onClose={onClose}
      title={
        early
          ? t("admin.finance.payouts.releaseEarly")
          : t("admin.finance.payouts.release")
      }
      size="md"
      form={form}
      onSubmit={(v) => release.mutate(v)}
      isSubmitting={release.isPending}
      submitLabel={
        early
          ? t("admin.finance.payouts.releaseEarly")
          : t("admin.finance.payouts.release")
      }
    >
      <p className="text-muted">
        {t("admin.finance.payouts.releaseDescription")}
      </p>
      {early && (
        <p className="rounded border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800">
          {t("admin.finance.payouts.earlyReleaseWarning")}
        </p>
      )}
      <FormTextarea
        name="reason"
        label={t("admin.finance.payouts.releaseReason")}
        rows={3}
        maxLength={500}
        placeholder={t("admin.finance.payouts.releaseReasonPlaceholder")}
      />
    </FormModal>
  );
}
