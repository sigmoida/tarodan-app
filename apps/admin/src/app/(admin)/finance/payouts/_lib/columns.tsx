import { Badge, paymentHoldStatusConfig } from "@tarodan/ui";
import { col } from "@/components/table";
import { HoldReasonBadge, holdReasonForRow } from "./holds";
import { transactionRowMenu } from "./rowActions";
import { type ScheduleItem, type PayoutTransaction } from "./types";
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
    col.rowMenu<PayoutTransaction>(transactionRowMenu(onRelease, t)),
  ];
}
