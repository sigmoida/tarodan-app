/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { StatusBadge, tradeStatusConfig } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { useLocale, useTranslations } from "next-intl";
import { formatTradeStatus } from "@/lib/format";
import {
  calculateTotalValue,
  getItemImage,
  type Trade,
  type TradeItem,
} from "../_lib/types";

const fmt = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function ItemColumn({ label, items }: { label: string; items: TradeItem[] }) {
  const total = calculateTotalValue(items);
  return (
    <div className="md:col-span-1">
      <p className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">
        {label}
      </p>
      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
        {items.map((item, idx) => (
          <div
            key={item.id || idx}
            className="flex items-center gap-3 p-2 bg-surface rounded hover:bg-surface-alt transition-colors"
          >
            <div className="relative w-16 h-16 rounded overflow-hidden bg-border-subtle flex-shrink-0">
              <OptimizedImage
                src={getItemImage(item)}
                alt={item.productTitle}
                fill
                className="object-cover"
                fallbackSrc="https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün"
                logContext={{ itemId: item.id, page: "trades-list" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-heading truncate">
                {item.productTitle}
              </p>
              <p className="text-xs text-muted">
                {item.quantity}x • {fmt(item.valueAtTrade)} TL
              </p>
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted">Toplam</p>
          <p className="text-sm font-semibold text-heading">{fmt(total)} TL</p>
        </div>
      )}
    </div>
  );
}

export default function TradeCard({
  trade,
  currentUserId,
}: {
  trade: Trade;
  currentUserId?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const statusLabels: Record<string, string> = {
    pending: t("trade.statusPending"),
    accepted: t("trade.statusAccepted"),
    rejected: t("trade.statusRejected"),
    initiator_shipped: t("trade.statusInitiatorShipped"),
    receiver_shipped: t("trade.statusReceiverShipped"),
    both_shipped: t("trade.statusBothShipped"),
    initiator_received: t("trade.statusInitiatorReceived"),
    receiver_received: t("trade.statusReceiverReceived"),
    completed: t("trade.statusCompleted"),
    cancelled: t("trade.statusCancelled"),
    disputed: t("trade.statusDisputed"),
  };

  const isSent = trade.initiatorId === currentUserId;
  const otherUserName = isSent
    ? trade.receiverName || trade.receiver?.displayName || t("common.name")
    : trade.initiatorName || trade.initiator?.displayName || t("common.name");
  const myItems = isSent ? trade.initiatorItems : trade.receiverItems;
  const theirItems = isSent ? trade.receiverItems : trade.initiatorItems;

  return (
    <Link
      href={`/profile/trades/${trade.id}`}
      className="block bg-surface-elevated rounded p-6 border border-border hover:border-primary-300 hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <p className="text-xs text-muted mb-1 font-mono">
            #{trade.tradeNumber}
          </p>
          <p className="font-semibold text-heading text-lg">
            {isSent ? t("trade.sentTrades") : t("trade.receivedTrades")} •{" "}
            {otherUserName}
          </p>
        </div>
        <StatusBadge
          status={trade.status}
          config={tradeStatusConfig}
          label={
            statusLabels[trade.status] ||
            formatTradeStatus(trade.status, locale)
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <ItemColumn label={t("trade.yourItems")} items={myItems} />
        <div className="hidden md:flex items-center justify-center">
          <div className="w-12 h-12 rounded-sm bg-primary-100 flex items-center justify-center">
            <ArrowsRightLeftIcon className="w-6 h-6 text-primary-600" />
          </div>
        </div>
        <ItemColumn label={t("trade.theirItems")} items={theirItems} />
      </div>

      <div className="md:hidden flex items-center justify-center my-4">
        <ArrowsRightLeftIcon className="w-6 h-6 text-primary-500" />
      </div>

      {trade.cashAmount && trade.cashAmount > 0 ? (
        <div className="mt-4 pt-4 border-t border-border bg-primary-50 rounded p-3">
          <p className="text-sm text-body">
            {t("trade.cashDifference")}:{" "}
            <span className="font-bold text-primary-600 text-base">
              {fmt(Number(trade.cashAmount))} TL
            </span>
          </p>
        </div>
      ) : null}

      <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
        <div className="text-sm text-muted">
          {new Date(trade.createdAt).toLocaleDateString("tr-TR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
        <div className="text-xs text-subtle">
          {t("trade.clickToViewDetails")}
        </div>
      </div>
    </Link>
  );
}
