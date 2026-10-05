"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import {
  FormModal,
  FormSelect,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import {
  ADMIN_CANCEL_NOTE_MAX,
  type AdminTradeCancelPreview,
} from "@tarodan/types";
import { fmtTry } from "@/lib/format";
import { extractErrorMessage } from "@/lib/error";
import { adminCancelReasonOptions } from "@/lib/admin-cancel-reasons";
import { useTradeAdminCancel } from "../_hooks/useTradeAdminCancel";
import {
  NO_ADMIN_CANCEL_REASON,
  adminCancelTradeSchema,
  type AdminCancelTradeValues,
} from "../_lib/schema";
import type { TradeDetail } from "../types";

const RESET_VALUES: AdminCancelTradeValues = {
  reasonCode: NO_ADMIN_CANCEL_REASON,
  note: "",
};

/**
 * Platform (admin) takas iptali: katalog nedeni zorunlu, iç not ("Diğer"de
 * zorunlu) yalnız denetime gider. Önizleme iptalle AYNI sunucu hesabından gelir;
 * takas bu arada uygunluğunu yitirdiyse sunucunun engel metni gösterilir.
 */
export function AdminCancelTradeModal({
  open,
  onClose,
  trade,
}: {
  open: boolean;
  onClose: () => void;
  trade: TradeDetail;
}) {
  const t = useTranslations();
  const form = useZodForm(adminCancelTradeSchema(t), {
    defaultValues: RESET_VALUES,
  });
  const { preview, cancel } = useTradeAdminCancel({
    tradeId: trade.id,
    open,
    onDone: onClose,
  });

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.operations.trades.adminCancel.title")}
      form={form}
      onSubmit={(values) => {
        // Şema "seçilmedi"yi reddettiği için buraya ulaşmaz; daraltma tipi
        // katalog koduna indirir (cast yok).
        if (values.reasonCode === NO_ADMIN_CANCEL_REASON) return;
        cancel.mutate({
          reasonCode: values.reasonCode,
          note: values.note.trim() || undefined,
        });
      }}
      isSubmitting={cancel.isPending}
      submitLabel={t("admin.operations.trades.adminCancel.confirm")}
      destructive
      resetValues={RESET_VALUES}
    >
      <p className="text-sm text-muted">
        {t("admin.operations.trades.adminCancel.description", {
          tradeNumber: trade.tradeNumber ?? trade.id,
        })}
      </p>
      <Alert variant="warning">
        {t("admin.operations.trades.adminCancel.warning")}
      </Alert>
      {preview.data ? (
        <CancelPreview preview={preview.data} trade={trade} />
      ) : (
        <p className="rounded-lg bg-surface-alt px-4 py-3 text-sm text-muted">
          {preview.isError
            ? extractErrorMessage(
                preview.error,
                t("admin.operations.trades.adminCancel.previewUnavailable"),
              )
            : t("admin.operations.trades.adminCancel.previewLoading")}
        </p>
      )}
      <FormSelect
        name="reasonCode"
        label={t("admin.operations.trades.adminCancel.reason")}
        placeholder={t("admin.operations.trades.adminCancel.reasonPlaceholder")}
        options={adminCancelReasonOptions(t)}
        disabled={cancel.isPending}
      />
      <FormTextarea
        name="note"
        label={t("admin.operations.trades.adminCancel.note")}
        placeholder={t("admin.operations.trades.adminCancel.notePlaceholder")}
        maxLength={ADMIN_CANCEL_NOTE_MAX}
        rows={3}
        disabled={cancel.isPending}
      />
    </FormModal>
  );
}

/** Taraf başına iade + serbest kalacak ürünler + iptal edilecek etiketler. */
function CancelPreview({
  preview,
  trade,
}: {
  preview: AdminTradeCancelPreview;
  trade: TradeDetail;
}) {
  const t = useTranslations();
  const partyName = (side: "initiator" | "receiver") =>
    side === "initiator"
      ? trade.initiator?.displayName
      : trade.receiver?.displayName;

  return (
    <div className="space-y-3 rounded-lg bg-surface-alt px-4 py-3 text-sm">
      <div>
        <p className="mb-1 font-medium text-heading">
          {t("admin.operations.trades.adminCancel.refundsTitle")}
        </p>
        <ul className="space-y-1">
          {preview.refunds.map((line) => (
            <li
              key={line.userId}
              className="flex flex-wrap items-baseline justify-between gap-x-4"
            >
              <span className="min-w-0 truncate text-body">
                {partyName(line.side)}{" "}
                <span className="text-xs text-subtle">
                  (
                  {line.side === "initiator"
                    ? t("admin.operations.trades.offerer")
                    : t("admin.operations.trades.offerReceiver")}
                  )
                </span>
              </span>
              <span className="tabular-nums text-heading">
                {line.paid
                  ? fmtTry(line.refundAmount)
                  : t("admin.operations.trades.adminCancel.notPaid")}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-border pt-2 font-semibold text-heading">
          <span>{t("admin.operations.trades.adminCancel.refundTotal")}</span>
          <span className="tabular-nums">{fmtTry(preview.refundTotal)}</span>
        </p>
      </div>
      <div>
        <p className="mb-1 font-medium text-heading">
          {t("admin.operations.trades.adminCancel.releasedTitle")}
        </p>
        {preview.releasedItems.length > 0 ? (
          <ul className="list-inside list-disc text-body">
            {preview.releasedItems.map((item) => (
              <li key={`${item.side}-${item.productId}`} className="truncate">
                {item.title}
                {item.quantity > 1 ? ` × ${item.quantity}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">
            {t("admin.operations.trades.adminCancel.noReservation")}
          </p>
        )}
      </div>
      {preview.labelsToCancel > 0 && (
        <p className="text-xs text-subtle">
          {t("admin.operations.trades.adminCancel.labelsToCancel", {
            count: preview.labelsToCancel,
          })}
        </p>
      )}
    </div>
  );
}
