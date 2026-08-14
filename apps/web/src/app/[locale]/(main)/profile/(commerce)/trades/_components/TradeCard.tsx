/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { StatusBadge, tradeStatusConfig } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { ButtonLink, SellerChip } from "@/components/ui";
import { useLocale, useTranslations } from "next-intl";
import { formatTradeStatus } from "@/lib/format";
import {
  calculateTotalValue,
  cashPayerName,
  getItemImage,
  type Trade,
  type TradeItem,
} from "../_lib/types";
import { TradeSwapBadge } from "./TradeSwapBadge";
import { publicNameOf } from "@/lib/public-name";

const fmt = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function ItemColumn({ label, items }: { label: string; items: TradeItem[] }) {
  const t = useTranslations();
  const total = calculateTotalValue(items);
  return (
    <div className="md:col-span-1">
      <p className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">
        {label}
      </p>
      <div className="space-y-1 max-h-[150px] overflow-y-auto pr-2">
        {items.map((item, idx) => (
          <Link
            key={item.id || idx}
            href={`/listings/${item.productId}`}
            className="group/item flex items-center gap-3 rounded-lg p-2 transition-colors"
          >
            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-border-subtle flex-shrink-0">
              <OptimizedImage
                src={getItemImage(item)}
                alt={item.productTitle}
                fill
                sizes="64px"
                className="object-cover"
                fallbackSrc="https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün"
                logContext={{ itemId: item.id, page: "trades-list" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-heading truncate transition-colors group-hover/item:text-primary-600">
                {item.productTitle}
              </p>
              <p className="text-xs text-muted">
                {item.quantity}x • {fmt(item.valueAtTrade)} TL
              </p>
            </div>
          </Link>
        ))}
      </div>
      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted">{t("common.total")}</p>
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
    ? trade.receiverName || publicNameOf(trade.receiver, t("common.name"))
    : trade.initiatorName || publicNameOf(trade.initiator, t("common.name"));
  const myItems = isSent ? trade.initiatorItems : trade.receiverItems;
  const theirItems = isSent ? trade.receiverItems : trade.initiatorItems;

  const hasCash = !!trade.cashAmount && trade.cashAmount > 0;
  const payerName = cashPayerName(trade);

  return (
    <div className="bg-surface-elevated rounded-lg p-6 border border-border">
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

      {/*
        Takas rozeti İKİ sütunun ARASINDA, tek kopya. Önceden iki kez
        basılıyordu: biri ızgaranın orta hücresinde (`hidden md:flex`), biri
        ızgaradan SONRA (`md:hidden`) — bu yüzden mobilde ikon iki listenin de
        altına, kartın en sonuna düşüyordu. Tek sütuna inen ızgara çocukları
        kaynak sırasına göre dizdiği için ayrı bir mobil kopyaya gerek yok.
      */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <ItemColumn label={t("trade.yourItems")} items={myItems} />
        <div className="flex items-center justify-center">
          <TradeSwapBadge />
        </div>
        <ItemColumn label={t("trade.theirItems")} items={theirItems} />
      </div>

      {hasCash && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{t("trade.cashDifference")}</p>
              <p className="text-lg font-bold text-primary-600">
                {fmt(Number(trade.cashAmount))} TL
              </p>
            </div>
            {trade.cashPayerId && payerName && (
              <SellerChip
                id={trade.cashPayerId}
                displayName={payerName}
                role={t("trade.payingParty")}
                size="sm"
              />
            )}
          </div>
        </div>
      )}

      {/* `flex-wrap`: uzun tarih ("14 Ağustos 2026") ile sarmayan buton metni
          dar telefonda yan yana sığmıyor ve satırı taşırıyordu. Sığmadığında
          buton alt satıra iner. */}
      <div className="mt-4 pt-4 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          {new Date(trade.createdAt).toLocaleDateString("tr-TR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
        <ButtonLink
          href={`/profile/trades/${trade.id}`}
          variant="outline"
          size="sm"
          className="gap-1"
        >
          {t("trade.clickToViewDetails")}
          <ChevronRightIcon className="h-4 w-4" />
        </ButtonLink>
      </div>
    </div>
  );
}
