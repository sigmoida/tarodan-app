"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

export function ApproveTradeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const t = useTranslations();
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) setNotes("");
  }, [open]);

  const approve = useAdminMutation(
    () => adminApi.approveTrade(tradeId, notes.trim() || undefined),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.approvedMsg"),
      errorMessage: t("admin.operations.trades.approveFailed"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen={open}
      onClose={() => !approve.isPending && onClose()}
      title={t("admin.operations.trades.approveTitle")}
    >
      <div className="space-y-4">
        <p className="text-sm text-body">
          {t("admin.operations.trades.approveBody")}
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.common.noteOptional")}
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("admin.operations.trades.approveNotePlaceholder")}
            disabled={approve.isPending}
          />
        </div>
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => approve.mutate()}
          confirmLabel={t("common.confirm")}
          confirmVariant="success"
          isLoading={approve.isPending}
        />
      </div>
    </Modal>
  );
}
