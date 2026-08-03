"use client";

import { enumLabel, paymentStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import type { TradeCashPayment, TradeDetail, TradeItem } from "../types";

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

/** Tutarı 0 olan kalem gösterilmez — v1/v2 satırları aynı bileşenle çizilir. */
function PaymentLine({ label, amount }: { label: string; amount: number }) {
  if (!(amount > 0)) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{fmtTry(amount)}</span>
    </div>
  );
}

/**
 * Bir tarafın ödeme satırı. v2'de her takasta iki tane vardır (kafa kafaya
 * takasta bile): hizmet bedeli + 2 bacaklık kargo + varsa nakit fark.
 */
function PaymentRow({
  payment,
  payerName,
}: {
  payment: TradeCashPayment;
  payerName: string;
}) {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-heading">{payerName}</span>
        <span className="text-sm">
          {enumLabel(paymentStatusConfig, payment.status, payment.status)}
        </span>
      </div>
      <PaymentLine
        label={t("trade.serviceFee")}
        amount={Number(payment.tradeFeeAmount ?? 0)}
      />
      <PaymentLine
        label={t("trade.shippingFee")}
        amount={Number(payment.shippingAmount ?? 0)}
      />
      <PaymentLine
        label={t("trade.cashDifferenceLine")}
        amount={Number(payment.amount ?? 0)}
      />
      <PaymentLine
        label={t("admin.operations.trades.balance.commission")}
        amount={Number(payment.commission ?? 0)}
      />
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-border-subtle pt-1 text-sm font-medium">
        <span>{t("admin.operations.trades.balance.chargedTotal")}</span>
        <span className="tabular-nums">
          {fmtTry(Number(payment.totalAmount))}
        </span>
      </div>
    </div>
  );
}

/**
 * Takas farkının kalem kalem dökümü: iki tarafın ürün kalemleri + ara
 * toplamları, ürün değeri farkı (kimin lehine), anlaşılan nakit fark (ödeyen)
 * ve TARAF BAŞINA tahsil edilen ödeme satırları.
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
  // v2: taraf başına satır; v1: takas başına tek satır (aynı bileşenle çizilir).
  const payments = trade.cashPayments?.length
    ? trade.cashPayments
    : trade.cashPayment
      ? [trade.cashPayment]
      : [];
  const nameOf = (userId: string) =>
    userId === trade.initiator.id
      ? trade.initiator.displayName
      : trade.receiver.displayName;

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
        ) : (
          <p className="text-muted">
            {t("admin.operations.trades.balance.equalTrade")}
          </p>
        )}
      </div>

      {/* Ödeme satırları: v2'de kafa kafaya takasta bile İKİ taraf öder, bu
          yüzden nakit farkı olmasa da bu blok gösterilir. */}
      {payments.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-heading">
            {t("admin.operations.trades.balance.paymentsTitle")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {payments.map((payment) => (
              <PaymentRow
                key={payment.id ?? payment.payerId}
                payment={payment}
                payerName={nameOf(payment.payerId)}
              />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
