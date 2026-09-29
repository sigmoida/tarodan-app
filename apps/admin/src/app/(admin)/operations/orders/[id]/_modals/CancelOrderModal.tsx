"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { fmtTry } from "@/lib/format";
import { useOrderCancel } from "../_hooks/useOrderCancel";
import {
  CANCEL_REASON_MAX_LENGTH,
  cancelShippingNoteKey,
  isValidCancelReason,
} from "../_lib/cancel";

/**
 * Kargo öncesi platform iptali: gerekçe zorunlu, geri alınamaz uyarısı ve
 * alıcıya dönecek tutar (iptalle aynı sunucu hesabından). Yalnız bu sipariş
 * (sepet kalemi) iptal edilir; sepetin diğer kalemleri etkilenmez.
 */
export function CancelOrderModal({
  open,
  onClose,
  orderId,
  orderNumber,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const { preview, cancel } = useOrderCancel({
    orderId,
    open,
    onDone: onClose,
  });

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("admin.operations.orders.cancel.title")}
      closeButtonDisabled={cancel.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => cancel.mutate(reason)}
          cancelLabel={t("common.close")}
          confirmLabel={t("admin.operations.orders.cancel.confirm")}
          destructive
          disabled={!isValidCancelReason(reason)}
          isLoading={cancel.isPending}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t("admin.operations.orders.cancel.description", { orderNumber })}
        </p>
        <Alert variant="warning">
          {t("admin.operations.orders.cancel.warning")}
        </Alert>
        <div className="rounded-lg bg-surface-alt px-4 py-3 text-sm">
          {preview.data ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-muted">
                {t("admin.operations.orders.cancel.refundAmount")}
              </span>
              <span className="text-base font-semibold tabular-nums text-heading">
                {fmtTry(preview.data.refundAmount)}
              </span>
              <span className="w-full text-xs text-subtle">
                {t(cancelShippingNoteKey(preview.data))}
              </span>
            </div>
          ) : (
            <p className="text-muted">
              {preview.isError
                ? t("admin.operations.orders.cancel.previewUnavailable")
                : t("admin.operations.orders.cancel.previewLoading")}
            </p>
          )}
        </div>
        <Textarea
          label={t("admin.operations.orders.cancel.reason")}
          placeholder={t("admin.operations.orders.cancel.reasonPlaceholder")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={CANCEL_REASON_MAX_LENGTH}
          rows={3}
          disabled={cancel.isPending}
        />
      </div>
    </Modal>
  );
}
