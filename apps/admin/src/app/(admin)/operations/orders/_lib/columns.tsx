import Link from "next/link";
import { Badge, orderStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { cancelReasonLabel, orderOriginLabel } from "@/lib/utils";
import { fmtTry } from "@/lib/format";
import { col, TruncatedText } from "@/components/table";
import { type OrderGroupRow } from "./orders";
import { statusConfig } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Ana satır = sipariş/sepet çatısı: numara, durum, alıcı, tutar+komisyon,
 * tarih. Ürünler, kargo durumu ve adet satırın altındaki kartta (hep açık)
 * olduğu için burada kolon değildir; kaynak sekmeden bellidir.
 */
export function orderColumns({ t }: { t: T }) {
  return [
    col.custom<OrderGroupRow>(
      t("admin.operations.orders.groupNumber"),
      (o) => (
        <Link
          href={`/operations/orders/${o.orderId}`}
          className="block text-primary-600 hover:underline"
        >
          <TruncatedText className="font-mono">{o.displayNumber}</TruncatedText>
        </Link>
      ),
      {
        minWidth: 180,
        sortKey: "orderNumber",
        sortType: "text",
        exportValue: (o) => o.displayNumber,
      },
    ),
    col.custom<OrderGroupRow>(
      t("common.status"),
      (o) =>
        o.itemCount > 1 ? (
          <Badge variant={o.groupStatus === "done" ? "success" : "default"}>
            {o.groupStatus === "done"
              ? t("admin.operations.orders.groupDone")
              : t("admin.operations.orders.groupOngoing")}
          </Badge>
        ) : (
          <div className="flex min-w-0 max-w-full flex-col items-start gap-1">
            {o.activeRefundRequest ? (
              <Badge
                status="refund_requested"
                config={statusConfig(orderStatusConfig, t)}
                label={t("admin.operations.orders.status.refundInProgress")}
              />
            ) : o.cancellationType === "iptal" ? (
              <Badge
                status="cancelled"
                config={statusConfig(orderStatusConfig, t)}
                label={t("admin.operations.orders.status.cancelledConfirmed")}
              />
            ) : (
              <Badge
                status={o.status}
                config={statusConfig(orderStatusConfig, t)}
              />
            )}
            {(o.status === "cancelled" || o.cancellationType === "iptal") &&
              cancelReasonLabel(o.cancelReason, t) && (
                <span className="max-w-full whitespace-normal break-words text-xs leading-snug text-muted">
                  {`${cancelReasonLabel(o.cancelReason, t)} · ${t(
                    "admin.operations.orders.originCancellation",
                    { origin: orderOriginLabel(o.origin, t) },
                  )}`}
                </span>
              )}
          </div>
        ),
      { minWidth: 190 },
    ),
    col.user<OrderGroupRow>(
      t("admin.operations.orders.buyer"),
      (o) => ({
        name: o.buyer.displayName,
        secondary: o.buyer.email,
        // Misafir alıcının id'si ortak GUEST_SYSTEM hesabı — link üretilmez.
        href: o.buyer.isGuest ? undefined : `/accounts/users/${o.buyer.id}`,
      }),
      {
        minWidth: 240,
        sortKey: "buyer.displayName",
        sortType: "text",
      },
    ),
    col.custom<OrderGroupRow>(
      t("admin.operations.orders.amountCommission"),
      (o) => {
        const rate =
          o.subtotal > 0 ? Math.round((o.commission / o.subtotal) * 100) : null;
        return (
          <div className="flex flex-col items-start leading-tight">
            <span className="text-sm font-semibold tabular-nums text-primary-700">
              {fmtTry(o.totalAmount)}
            </span>
            <span className="whitespace-nowrap text-xs tabular-nums text-muted">
              {t("admin.operations.orders.commissionShort")}{" "}
              <span className="font-medium text-success-600">
                {fmtTry(o.commission)}
              </span>
              {rate != null && ` · %${rate}`}
            </span>
          </div>
        );
      },
      {
        minWidth: 170,
        sortKey: "totalAmount",
        sortType: "number",
        exportValue: (o) => `${o.totalAmount} / ${o.commission}`,
      },
    ),
    col.date<OrderGroupRow>(t("common.date"), "createdAt", { minWidth: 110 }),
  ];
}
