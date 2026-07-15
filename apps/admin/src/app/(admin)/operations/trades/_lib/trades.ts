import { tradeStatusConfig, type StatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { statusFilterOptions } from "@/lib/utils";

type T = ReturnType<typeof useTranslations<never>>;

export interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiator: { id: string; displayName: string };
  receiver: { id: string; displayName: string };
  cashAmount?: number;
  hasDispute: boolean;
  createdAt: string;
  cancelReason?: string;
}

// Intermediate/per-side statuses are intentionally hidden (needless detail for admins; they still render correctly in the badge).
const TRADE_FILTER_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "awaiting_payment",
  "shipping_to_warehouse",
  "at_warehouse",
  "admin_reviewing",
  "shipping_to_recipients",
  "returning",
  "both_shipped",
  "completed",
  "disputed",
  "cancelled",
];

export const statusOptions = statusFilterOptions(tradeStatusConfig, {
  keys: TRADE_FILTER_STATUSES,
});

export const disputeConfig = (t: T): Record<string, StatusConfig> => ({
  disputed_override: {
    label: t("admin.operations.trades.disputed"),
    variant: "destructive",
  },
});

export function mapTrades(raw: any[], t: T): Trade[] {
  return raw.map((tr: any) => ({
    id: tr.id,
    tradeNumber: tr.tradeNumber || `TRD-${tr.id.slice(0, 8)}`,
    status: tr.status,
    initiator: tr.initiator || {
      id: "",
      displayName: t("admin.operations.trades.initiator"),
    },
    receiver: tr.receiver || {
      id: "",
      displayName: t("admin.operations.trades.receiver"),
    },
    cashAmount: Number(tr.cashAmount || 0),
    hasDispute: !!tr.dispute,
    createdAt: tr.createdAt,
    cancelReason: tr.cancelReason ?? undefined,
  }));
}
