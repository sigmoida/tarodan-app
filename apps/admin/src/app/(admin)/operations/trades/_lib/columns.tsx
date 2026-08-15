import Link from "next/link";
import { Badge, tradeStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { cancelReasonLabel } from "@/lib/utils";
import { col, TruncatedText } from "@/components/table";
import { type Trade, disputeConfig, cashPayer } from "./trades";
import { statusConfig } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

export function tradeColumns(t: T) {
  return [
    col.custom<Trade>(
      t("admin.operations.trades.tradeNumber"),
      (trade) => (
        <Link
          href={`/operations/trades/${trade.id}`}
          className="block text-primary-600 hover:underline"
        >
          <TruncatedText className="font-mono">
            {trade.tradeNumber}
          </TruncatedText>
        </Link>
      ),
      {
        minWidth: 240,
        sortKey: "tradeNumber",
        sortType: "text",
        exportValue: (trade) => trade.tradeNumber,
      },
    ),
    col.custom<Trade>(
      t("common.status"),
      (r) =>
        r.hasDispute ? (
          <Badge
            status="disputed_override"
            config={disputeConfig(t)}
            label={t("admin.operations.trades.disputedBadge")}
          />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <Badge
              status={r.status}
              config={statusConfig(tradeStatusConfig, t)}
            />
            {r.status === "cancelled" &&
              cancelReasonLabel(r.cancelReason, t) && (
                <span className="truncate text-xs text-muted">
                  {cancelReasonLabel(r.cancelReason, t)}
                </span>
              )}
          </div>
        ),
      { grow: 2, minWidth: 200, sortKey: "status", sortType: "text" },
    ),
    col.user<Trade>(t("admin.operations.trades.initiator"), (r) => ({
      name: r.initiator.displayName,
      secondary: r.initiator.email,
      href: `/accounts/users/${r.initiator.id}`,
    })),
    col.user<Trade>(t("admin.operations.trades.receiver"), (r) => ({
      name: r.receiver.displayName,
      secondary: r.receiver.email,
      href: `/accounts/users/${r.receiver.id}`,
    })),
    col.money<Trade>(
      t("admin.operations.trades.cash"),
      (r) => r.cashAmount || null,
      {
        tone: "primary",
        sortKey: "cashAmount",
        sortType: "number",
      },
    ),
    col.user<Trade>(
      t("admin.operations.trades.paidBy"),
      (r) => {
        const payer = cashPayer(r);
        return payer
          ? {
              name: payer.displayName,
              secondary: payer.email,
              href: `/accounts/users/${payer.id}`,
            }
          : null;
      },
      { minWidth: 300 },
    ),
    col.date<Trade>(t("common.date"), "createdAt"),
  ];
}
