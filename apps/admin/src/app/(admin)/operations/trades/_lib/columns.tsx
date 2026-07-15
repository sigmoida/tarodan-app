import { Badge, tradeStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { cancelReasonLabel } from "@/lib/utils";
import { col, type RowActionItem } from "@/components/table";
import { type Trade, disputeConfig } from "./trades";

type T = ReturnType<typeof useTranslations<never>>;

export function tradeColumns(t: T, rowMenu: (t: Trade) => RowActionItem[]) {
  return [
    col.code<Trade>(
      t("admin.operations.trades.tradeNumber"),
      (r) => r.tradeNumber,
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
            <Badge status={r.status} config={tradeStatusConfig} />
            {r.status === "cancelled" && cancelReasonLabel(r.cancelReason) && (
              <span className="truncate text-xs text-muted">
                {cancelReasonLabel(r.cancelReason)}
              </span>
            )}
          </div>
        ),
      { grow: 2, minWidth: 150 },
    ),
    col.user<Trade>(t("admin.operations.trades.initiator"), (r) => ({
      name: r.initiator.displayName,
      href: `/accounts/users/${r.initiator.id}`,
    })),
    col.user<Trade>(t("admin.operations.trades.receiver"), (r) => ({
      name: r.receiver.displayName,
      href: `/accounts/users/${r.receiver.id}`,
    })),
    col.money<Trade>(
      t("admin.operations.trades.cash"),
      (r) => r.cashAmount || null,
      {
        tone: "primary",
      },
    ),
    col.date<Trade>(t("common.date"), (r) => r.createdAt),
    col.rowMenu<Trade>(rowMenu),
  ];
}
