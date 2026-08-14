/** @format */

import Link from "next/link";
import {
  ArrowsRightLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Button, EmptyState, StatusBadge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import {
  type RecentTrade,
  dashboardTradeStatusConfig,
  formatRelativeDate,
} from "../_lib/types";

type T = ReturnType<typeof useTranslations<never>>;

function tradeSummary(trade: RecentTrade, t: T) {
  const initiatorName =
    trade.initiator?.displayName || trade.initiator?.email || t("common.user");
  const receiverName =
    trade.receiver?.displayName || trade.receiver?.email || t("common.user");
  const initiatorItems = (trade.items || []).filter(
    (i) => i.side === "initiator",
  );
  const receiverItems = (trade.items || []).filter(
    (i) => i.side === "receiver",
  );
  const offered = initiatorItems[0]?.product?.title;
  const requested = receiverItems[0]?.product?.title;
  const offeredLabel = offered
    ? offered +
      (initiatorItems.length > 1 ? ` (+${initiatorItems.length - 1})` : "")
    : "—";
  const requestedLabel = requested
    ? requested +
      (receiverItems.length > 1 ? ` (+${receiverItems.length - 1})` : "")
    : "—";
  return { initiatorName, receiverName, offeredLabel, requestedLabel };
}

export function RecentTrades({ trades }: { trades: RecentTrade[] }) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.dashboard.recentTrades.title")}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/operations/trades">
            {t("common.seeAll")}
            <ChevronRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-3">
        {trades.length > 0 ? (
          trades.map((trade) => {
            const s = tradeSummary(trade, t);
            return (
              <div
                key={trade.id}
                className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center">
                  <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-500/20">
                    <ArrowsRightLeftIcon className="h-5 w-5 text-success-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-heading">
                      <span className="font-medium">{s.initiatorName}</span>
                      <span className="mx-2 text-muted">→</span>
                      <span className="font-medium">{s.receiverName}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {s.offeredLabel} → {s.requestedLabel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:ml-3">
                  <StatusBadge
                    status={trade.status}
                    config={dashboardTradeStatusConfig(t)}
                  />
                  <span className="whitespace-nowrap text-xs text-muted">
                    {formatRelativeDate(trade.createdAt, t)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            size="compact"
            title={t("admin.dashboard.recentTrades.empty")}
          />
        )}
      </div>
    </SectionCard>
  );
}
