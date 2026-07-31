"use client";

import { enumLabel, paymentStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import type { TradeDetail, TradeItem } from "../types";

const itemsTotal = (items: TradeItem[]) =>
  items.reduce((sum, item) => sum + Number(item.product?.price ?? 0), 0);

/** Bir tarafın ürün kalemleri + ara toplamı. */
function SideLines({
  label,
  totalLabel,
  items,
}: {
  label: string;
  totalLabel: string;
  items: TradeItem[];
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-heading">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-muted">
              {item.product?.title}
            </span>
            <span className="shrink-0 tabular-nums">
              {fmtTry(Number(item.product?.price ?? 0))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-border-subtle pt-1 text-sm font-medium">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{fmtTry(itemsTotal(items))}</span>
      </div>
    </div>
  );
}

/**
 * Takas farkının kalem kalem dökümü: iki tarafın ürün kalemleri + ara
 * toplamları, ürün değeri farkı (kimin lehine), anlaşılan nakit fark (ödeyen),
 * escrow'daki nakit ödemenin komisyonu ve tahsil edilen toplam.
 */
export function TradeBalanceCard({ trade }: { trade: TradeDetail }) {
  const t = useTranslations();

  const offeredTotal = itemsTotal(trade.initiatorItems);
  const counterTotal = itemsTotal(trade.receiverItems);
  const diff = counterTotal - offeredTotal;
  // Ürün değeri yüksek olan taraf "lehine" — fark onun lehinedir.
  const favoredName =
    diff === 0
      ? null
      : diff > 0
        ? trade.receiver.displayName
        : trade.initiator.displayName;
  const payerName = trade.cashPayerId
    ? trade.cashPayerId === trade.initiator.id
      ? trade.initiator.displayName
      : trade.receiver.displayName
    : null;
  const cash = trade.cashPayment;

  return (
    <SectionCard title={t("admin.operations.trades.balance.title")}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <SideLines
          label={t("admin.operations.trades.balance.offeredTotal")}
          totalLabel={t("common.total")}
          items={trade.initiatorItems}
        />
        <SideLines
          label={t("admin.operations.trades.balance.counterTotal")}
          totalLabel={t("common.total")}
          items={trade.receiverItems}
        />
      </div>

      <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">
            {t("admin.operations.trades.balance.productDiff")}
            {favoredName && (
              <>
                {" "}
                (
                {t("admin.operations.trades.balance.inFavorOf", {
                  name: favoredName,
                })}
                )
              </>
            )}
          </span>
          <span className="font-medium tabular-nums">
            {fmtTry(Math.abs(diff))}
          </span>
        </div>

        {trade.cashAmount && trade.cashAmount > 0 ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">
                {t("admin.operations.trades.balance.cashAgreed")}
                {payerName && (
                  <>
                    {" "}
                    · {t("admin.operations.trades.paidBy")}:{" "}
                    <span className="font-medium text-body">{payerName}</span>
                  </>
                )}
              </span>
              <span className="font-semibold text-primary-600 tabular-nums">
                +{fmtTry(trade.cashAmount)}
              </span>
            </div>
            {cash && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">
                    {t("admin.operations.trades.balance.commission")}
                  </span>
                  <span className="tabular-nums">
                    {fmtTry(Number(cash.commission))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span>
                    {t("admin.operations.trades.balance.chargedTotal")}
                  </span>
                  <span className="tabular-nums">
                    {fmtTry(Number(cash.totalAmount))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">
                    {t("admin.operations.trades.balance.paymentStatus")}
                  </span>
                  <span>
                    {enumLabel(paymentStatusConfig, cash.status, cash.status)}
                  </span>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-muted">
            {t("admin.operations.trades.balance.equalTrade")}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
