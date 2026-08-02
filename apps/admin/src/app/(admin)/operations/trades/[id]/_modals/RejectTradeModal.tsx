"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

export function RejectTradeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const reject = useAdminMutation(
    () => adminApi.rejectTrade(tradeId, reason.trim()),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.rejectedMsg"),
      errorMessage: t("admin.operations.trades.rejectFailed"),
      onSuccess: onClose,
    },
  );

  const tooShort = reason.trim().length < 10;

  return (
    <Modal
      isOpen={open}
      onClose={() => !reject.isPending && onClose()}
      title={t("admin.operations.trades.rejectTitle")}
      closeButtonDisabled={reject.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => reject.mutate()}
          confirmLabel={t("admin.operations.trades.reject")}
          destructive
          isLoading={reject.isPending}
          disabled={tooShort}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-body">
          {t("admin.operations.trades.rejectBody")}
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.trades.rejectReason")}{" "}
            <span className="text-danger-600">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={
              reason.length > 0 && tooShort
                ? "border-danger-400 focus:border-danger-500 focus:ring-danger-200"
                : undefined
            }
            rows={4}
            placeholder={t("admin.operations.trades.rejectPlaceholder")}
            disabled={reject.isPending}
          />
          <p className="mt-1 text-xs text-muted">
            {t("admin.operations.trades.charMinCounter", {
              count: reason.trim().length,
            })}
          </p>
        </div>
      </div>
    </Modal>
  );
}
