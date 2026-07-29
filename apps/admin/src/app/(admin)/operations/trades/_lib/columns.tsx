import { Badge, tradeStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { cancelReasonLabel } from "@/lib/utils";
import { col, type RowActionItem } from "@/components/table";
import { type Trade, disputeConfig, cashPayerName } from "./trades";

type T = ReturnType<typeof useTranslations<never>>;

export function tradeColumns(t: T, rowMenu: (t: Trade) => RowActionItem[]) {
  return [
    col.code<Trade>(t("admin.operations.trades.tradeNumber"), "tradeNumber"),
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
            {r.status === "cancelled" &&
              cancelReasonLabel(r.cancelReason, t) && (
                <span className="truncate text-xs text-muted">
                  {cancelReasonLabel(r.cancelReason, t)}
                </span>
              )}
          </div>
        ),
      { grow: 2, minWidth: 150, sortKey: "status", sortType: "text" },
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
        sortKey: "cashAmount",
        sortType: "number",
      },
    ),
    // Farkı kim öder — nakit farkı olan takaslarda ödeyen taraf, yoksa "—".
    col.custom<Trade>(
      t("admin.operations.trades.paidBy"),
      (r) => {
        const name = cashPayerName(r);
        return name ? (
          <span className="text-sm text-body">{name}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
      { minWidth: 120 },
    ),
    col.date<Trade>(t("common.date"), "createdAt"),
    col.rowMenu<Trade>(rowMenu),
  ];
}
