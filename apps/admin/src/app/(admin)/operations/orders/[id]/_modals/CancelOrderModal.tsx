"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ADMIN_CANCEL_NOTE_MAX,
  type AdminCancelReasonCode,
  type AdminOrderCancelPreview,
  type OrderReservationState,
} from "@tarodan/types";
import { Alert, Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { fmtTry } from "@/lib/format";
import { useOrderCancel } from "../_hooks/useOrderCancel";
import {
  cancelReasonOptions,
  cancelShippingNoteKey,
  isCancelRequestReady,
  isNoteMissing,
} from "../_lib/cancel";

/**
 * Yönetici (platform) iptali: katalogdan neden (zorunlu), iç not ("Diğer"de
 * zorunlu, taraflara gösterilmez), türe göre önizleme — ödenmemiş siparişte
 * "ödeme yok" + serbest kalan rezervasyon, ödenmişte alıcıya dönecek tutar +
 * geri eklenen stok. Sepet siparişi, teklif siparişi ve dosya/satır menüsü
 * hep bu diyaloğu açar. Yalnız bu sipariş (sepet kalemi) iptal edilir.
 */
export function CancelOrderModal({
  open,
  onClose,
  orderId,
  orderNumber,
  isOfferOrder = false,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  /** Teklif siparişi: bağlı teklifin de kapanacağı söylenir. */
  isOfferOrder?: boolean;
}) {
  const t = useTranslations();
  const [reasonCode, setReasonCode] = useState<AdminCancelReasonCode | "">("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setReasonCode("");
      setNote("");
    }
  }, [open]);
  const { preview, cancel, kindChanged } = useOrderCancel({
    orderId,
    open,
    onDone: onClose,
  });

  const request = { reasonCode: reasonCode || undefined, note };
  const unpaid = preview.data?.kind === "unpaid";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("admin.operations.orders.cancel.title")}
      closeButtonDisabled={cancel.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() =>
            reasonCode && cancel.mutate({ reasonCode, note: note.trim() })
          }
          cancelLabel={t("common.close")}
          confirmLabel={
            unpaid
              ? t("admin.operations.orders.cancel.confirmUnpaid")
              : t("admin.operations.orders.cancel.confirm")
          }
          destructive
          disabled={
            !preview.data ||
            preview.isFetching ||
            !isCancelRequestReady(request)
          }
          isLoading={cancel.isPending}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t("admin.operations.orders.cancel.description", { orderNumber })}
        </p>
        {kindChanged && (
          <Alert variant="info">
            {t("admin.operations.orders.cancel.kindChanged")}
          </Alert>
        )}
        <Alert variant="warning">
          {unpaid
            ? t("admin.operations.orders.cancel.warningUnpaid")
            : t("admin.operations.orders.cancel.warning")}
        </Alert>
        <div className="rounded-lg bg-surface-alt px-4 py-3 text-sm">
          {preview.data ? (
            <CancelPreviewSummary preview={preview.data} />
          ) : (
            <p className="text-muted">
              {preview.isError
                ? t("admin.operations.orders.cancel.previewUnavailable")
                : t("admin.operations.orders.cancel.previewLoading")}
            </p>
          )}
        </div>
        {isOfferOrder && (
          <p className="text-sm text-muted">
            {t("admin.operations.orders.cancel.offerOrder")}
          </p>
        )}
        <Select
          label={t("admin.operations.orders.cancel.reason")}
          placeholder={t("admin.operations.orders.cancel.reasonPlaceholder")}
          helperText={t("admin.operations.orders.cancel.reasonHint")}
          options={cancelReasonOptions(t)}
          value={reasonCode}
          onChange={(event) =>
            setReasonCode(event.target.value as AdminCancelReasonCode)
          }
          disabled={cancel.isPending}
        />
        <Textarea
          label={t("admin.operations.orders.cancel.note")}
          placeholder={t("admin.operations.orders.cancel.notePlaceholder")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={ADMIN_CANCEL_NOTE_MAX}
          rows={3}
          disabled={cancel.isPending}
          error={
            isNoteMissing(request)
              ? t("admin.operations.orders.cancel.noteRequired")
              : undefined
          }
        />
        <p className="text-xs text-subtle">
          {t("admin.operations.orders.cancel.partiesNotice")}
        </p>
      </div>
    </Modal>
  );
}

/** Serbest bırakılacak rezerv yoksa nedeni (katalog anahtarı). */
const RESERVATION_NOTE_KEYS = {
  already_released: "admin.operations.orders.cancel.reservationAlreadyReleased",
  not_reserved: "admin.operations.orders.cancel.reservationNotReserved",
} as const satisfies Record<Exclude<OrderReservationState, "held">, string>;

/** Önizlemenin türe göre özeti: para + stok. */
function CancelPreviewSummary({
  preview,
}: {
  preview: AdminOrderCancelPreview;
}) {
  const t = useTranslations();
  if (preview.kind === "unpaid") {
    return (
      <div className="space-y-1">
        <p className="font-medium text-heading">
          {t("admin.operations.orders.cancel.noPayment")}
        </p>
        <p className="text-xs text-subtle">
          {preview.reservation === "held"
            ? t("admin.operations.orders.cancel.reservationReleased", {
                count: preview.quantity,
              })
            : t(RESERVATION_NOTE_KEYS[preview.reservation])}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className="text-muted">
        {t("admin.operations.orders.cancel.refundAmount")}
      </span>
      <span className="text-base font-semibold tabular-nums text-heading">
        {fmtTry(preview.refundAmount)}
      </span>
      <span className="w-full text-xs text-subtle">
        {t(cancelShippingNoteKey(preview))}
        {" · "}
        {t("admin.operations.orders.cancel.stockRestored", {
          count: preview.quantity,
        })}
      </span>
    </div>
  );
}
