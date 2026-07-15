"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Textarea, Checkbox } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

export function ForceCancelModal({
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
  const [sendBack, setSendBack] = useState(true);
  useEffect(() => {
    if (open) {
      setReason("");
      setSendBack(true);
    }
  }, [open]);

  const forceCancel = useAdminMutation(
    () =>
      adminApi.forceCancelStuckTrade(tradeId, {
        reason: reason.trim(),
        sendArrivedItemBack: sendBack,
      }),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.forceCancelMsg"),
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (reason.trim().length < 10) {
      toast.error(t("admin.operations.trades.cancelReasonMinLen"));
      return;
    }
    forceCancel.mutate();
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !forceCancel.isPending && onClose()}
      title={t("admin.operations.trades.forceCancelTitle")}
    >
      <div className="space-y-4">
        <p className="text-sm text-body">
          {t("admin.operations.trades.forceCancelBody")}
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.trades.cancelReasonLabel")}
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("admin.operations.trades.forceCancelPlaceholder")}
            disabled={forceCancel.isPending}
          />
        </div>
        <Checkbox
          checked={sendBack}
          onChange={(e) => setSendBack(e.target.checked)}
          disabled={forceCancel.isPending}
          label={t("admin.operations.trades.sendBackLabel")}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          confirmLabel={t("admin.operations.trades.forceCancelTitle")}
          destructive
          isLoading={forceCancel.isPending}
        />
      </div>
    </Modal>
  );
}
