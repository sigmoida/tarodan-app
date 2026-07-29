"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

/** Open when `shipmentId` is set; marks that return shipment lost. */
export function MarkReturnLostModal({
  shipmentId,
  onClose,
  tradeId,
}: {
  shipmentId: string | null;
  onClose: () => void;
  tradeId: string;
}) {
  const t = useTranslations();
  const open = !!shipmentId;
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const markLost = useAdminMutation(
    () =>
      adminApi.markTradeReturnLost(tradeId, {
        shipmentId: shipmentId as string,
        reason: reason.trim(),
      }),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.markLostMsg"),
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (reason.trim().length < 10) {
      toast.error(t("admin.operations.trades.lostReasonMinLen"));
      return;
    }
    markLost.mutate();
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !markLost.isPending && onClose()}
      title={t("admin.operations.trades.markLostTitle")}
    >
      <div className="space-y-4">
        <p className="text-sm text-body">
          {t("admin.operations.trades.markLostBody")}
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.trades.lostReasonLabel")}
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("admin.operations.trades.markLostPlaceholder")}
            disabled={markLost.isPending}
          />
        </div>
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          confirmLabel={t("admin.operations.trades.markLost")}
          destructive
          isLoading={markLost.isPending}
        />
      </div>
    </Modal>
  );
}
