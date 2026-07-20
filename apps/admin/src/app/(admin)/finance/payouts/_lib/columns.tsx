import { Badge, paymentHoldStatusConfig } from "@tarodan/ui";
import { col } from "@/components/table";
import { HoldReasonBadge, holdReasonForRow } from "./holds";
import { transactionRowMenu } from "./rowActions";
import { type ScheduleItem, type PayoutTransaction } from "./types";

export const scheduleColumns = [
  col.text<ScheduleItem>("Sipariş", "orderNumber"),
  col.text<ScheduleItem>("Satıcı", "sellerName"),
  col.money<ScheduleItem>("Tutar", "amount"),
  col.date<ScheduleItem>("Serbest Bırakma Tarihi", "releaseAt"),
  col.badge<ScheduleItem>("Bekleme Nedeni", (s) => (
    <HoldReasonBadge
      reason={holdReasonForRow({ status: "held", releaseAt: s.releaseAt })}
    />
  )),
];

export function transactionColumns(onRelease: (orderId: string) => void) {
  return [
    col.text<PayoutTransaction>("Sipariş", (t) => t.orderNumber),
    col.user<PayoutTransaction>("Satıcı", (t) => ({
      name: t.sellerName,
      secondary: t.sellerEmail,
    })),
    col.money<PayoutTransaction>("Tutar", (t) => t.amount),
    col.badge<PayoutTransaction>("Durum", (t) => (
      <Badge status={t.status} config={paymentHoldStatusConfig} />
    )),
    col.date<PayoutTransaction>(
      "Serbest Bırakma",
      (t) => t.releasedAt || t.releaseAt,
    ),
    col.badge<PayoutTransaction>("Bekleme Nedeni", (t) => (
      <HoldReasonBadge
        reason={holdReasonForRow({ status: t.status, releaseAt: t.releaseAt })}
      />
    )),
    col.rowMenu<PayoutTransaction>(transactionRowMenu(onRelease)),
  ];
}
