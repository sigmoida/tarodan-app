import {
  Badge,
  Button,
  paymentHoldStatusConfig,
  payoutStatusConfig,
} from "@tarodan/ui";
import { col } from "@/components/table";
import { HoldReasonBadge, holdReasonForRow } from "./holds";
import {
  type ScheduleItem,
  type PayoutTransaction,
  type PayoutTransferRow,
  type PayoutAdjustmentRow,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const scheduleColumns = (t: T) => [
  col.text<ScheduleItem>(t("admin.finance.common.order"), "orderNumber", {
    grow: 3,
    minWidth: 260,
  }),
  col.user<ScheduleItem>(
    t("admin.finance.common.seller"),
    (row) => ({
      name: row.sellerName,
      secondary: row.sellerEmail,
      href: `/accounts/users/${row.sellerId}`,
    }),
    { grow: 5, minWidth: 360, sortKey: "sellerName" },
  ),
  col.money<ScheduleItem>(t("common.amount"), "amount"),
  col.date<ScheduleItem>(t("admin.finance.payouts.releaseDate"), "releaseAt"),
  col.badge<ScheduleItem>(
    t("admin.finance.payouts.holdReason"),
    (s) => (
      <HoldReasonBadge
        reason={holdReasonForRow({ status: "held", releaseAt: s.releaseAt }, t)}
      />
    ),
    { sortKey: "releaseAt", sortType: "date" },
  ),
];

export function transactionColumns(
  onRelease: ((orderId: string) => void) | undefined,
  t: T,
) {
  return [
    col.text<PayoutTransaction>(
      t("admin.finance.common.order"),
      (row) => row.orderNumber,
      { grow: 3, minWidth: 260, sortKey: "orderNumber" },
    ),
    col.user<PayoutTransaction>(
      t("admin.finance.common.seller"),
      (row) => ({
        name: row.sellerName,
        secondary: row.sellerEmail,
        href: `/accounts/users/${row.sellerId}`,
      }),
      { grow: 5, minWidth: 360, sortKey: "sellerName" },
    ),
    col.money<PayoutTransaction>(t("common.amount"), "amount"),
    col.badge<PayoutTransaction>(
      t("common.status"),
      (row) => <Badge status={row.status} config={paymentHoldStatusConfig} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.date<PayoutTransaction>(
      t("admin.finance.payouts.release"),
      (row) => row.releasedAt || row.releaseAt,
      { sortKey: "releaseAt", sortType: "date" },
    ),
    col.badge<PayoutTransaction>(
      t("admin.finance.payouts.holdReason"),
      (row) => (
        <HoldReasonBadge
          reason={holdReasonForRow(
            {
              status: row.status,
              releaseAt: row.releaseAt,
            },
            t,
          )}
        />
      ),
      { sortKey: "status" },
    ),
    // Tek aksiyon için ⋯ menüsü gereksiz tıklamaydı; Transferler sekmesindeki
    // "Yeniden Dene" ile aynı desen: doğrudan düğme. Yalnız HELD satırda görünür,
    // iade penceresi (releaseAt) dolmadan devre dışıdır; tıklayınca gerekçe
    // isteyen onay modalı (ReleasePayoutModal) açılır.
    ...(onRelease
      ? [
          col.actions<PayoutTransaction>(
            (row) => {
              if (row.status !== "held") return null;
              const releaseDue =
                row.releaseAt != null &&
                new Date(row.releaseAt).getTime() <= Date.now();
              return (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!releaseDue}
                  title={
                    releaseDue
                      ? undefined
                      : t("admin.finance.payouts.releaseDescription")
                  }
                  onClick={() => onRelease(row.orderId)}
                >
                  {t("admin.finance.payouts.release")}
                </Button>
              );
            },
            { header: t("common.actions") },
          ),
        ]
      : []),
  ];
}

/** Gerçek banka transferleri (PayoutTransfer) — hold listesinden ayrı yüzey. */
export function transferColumns(
  onRetry: ((transfer: PayoutTransferRow) => void) | undefined,
  retryingId: string | undefined,
  t: T,
) {
  return [
    col.link<PayoutTransferRow>(
      t("admin.finance.common.order"),
      (r) => ({
        href: r.orderId ? `/operations/orders/${r.orderId}` : "#",
        label: r.orderNumber ? `#${r.orderNumber}` : "—",
      }),
      { grow: 1, minWidth: 130, sortKey: "orderNumber" },
    ),
    col.user<PayoutTransferRow>(
      t("admin.finance.common.seller"),
      (r) => ({
        name: r.seller.displayName ?? r.seller.email ?? r.seller.id,
        secondary: r.seller.email ?? undefined,
        href: `/accounts/users/${r.seller.id}`,
      }),
      { grow: 3, minWidth: 260 },
    ),
    col.money<PayoutTransferRow>(
      t("admin.finance.payouts.netAmount"),
      "netAmount",
      { sortKey: "netAmount", sortType: "number" },
    ),
    col.money<PayoutTransferRow>(
      t("admin.finance.payouts.deduction"),
      "adjustmentDeduction",
      { sortKey: "adjustmentDeduction", sortType: "number" },
    ),
    col.code<PayoutTransferRow>(t("admin.finance.payouts.ibanLast4"), (r) =>
      r.ibanLast4 ? `••${r.ibanLast4}` : "—",
    ),
    col.custom<PayoutTransferRow>(
      t("common.status"),
      (r) => (
        <div className="min-w-0">
          <Badge status={r.status} config={payoutStatusConfig} />
          {r.failureReason && (
            <p className="mt-1 truncate text-xs text-danger-600">
              {r.failureReason}
            </p>
          )}
        </div>
      ),
      { grow: 2, minWidth: 180, sortKey: "status", sortType: "text" },
    ),
    col.date<PayoutTransferRow>(t("common.date"), "createdAt", {
      sortKey: "createdAt",
      sortType: "date",
    }),
    ...(onRetry
      ? [
          col.actions<PayoutTransferRow>(
            (r) =>
              r.status === "failed" || r.status === "returned" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={retryingId === r.id}
                  onClick={() => onRetry(r)}
                >
                  {t("admin.finance.payouts.retryTransfer")}
                </Button>
              ) : null,
            { header: t("common.actions") },
          ),
        ]
      : []),
  ];
}

/** Satıcı borç mahsupları (SellerAccountAdjustment). */
export function adjustmentColumns(t: T) {
  return [
    col.user<PayoutAdjustmentRow>(
      t("admin.finance.common.seller"),
      (r) => ({
        name: r.seller.displayName ?? r.seller.email ?? r.seller.id,
        secondary: r.seller.email ?? undefined,
        href: `/accounts/users/${r.seller.id}`,
      }),
      { grow: 3, minWidth: 260 },
    ),
    col.link<PayoutAdjustmentRow>(
      t("admin.finance.common.order"),
      (r) => ({
        href: r.orderId ? `/operations/orders/${r.orderId}` : "#",
        label: r.orderNumber ? `#${r.orderNumber}` : "—",
      }),
      { grow: 1, minWidth: 130 },
    ),
    col.text<PayoutAdjustmentRow>(
      t("admin.finance.invoices.type"),
      (r) => t(`admin.finance.payouts.adjustmentType.${r.type}`),
      { grow: 2, minWidth: 160, sortKey: "type", sortType: "text" },
    ),
    col.money<PayoutAdjustmentRow>(t("common.amount"), "amount", {
      sortKey: "amount",
      sortType: "number",
    }),
    col.money<PayoutAdjustmentRow>(
      t("admin.finance.payouts.remaining"),
      "remainingAmount",
      { sortKey: "remainingAmount", sortType: "number" },
    ),
    col.badge<PayoutAdjustmentRow>(t("common.status"), (r) => (
      <Badge variant={r.status === "open" ? "warning" : "success"} size="sm">
        {t(`admin.finance.payouts.adjustmentStatus.${r.status}`)}
      </Badge>
    )),
    col.date<PayoutAdjustmentRow>(t("common.date"), "createdAt", {
      sortKey: "createdAt",
      sortType: "date",
    }),
  ];
}
