"use client";

import { enumLabel, paymentStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import type { TradeCashPayment, TradeDetail, TradeItem } from "../types";

const itemsTotal = (items: TradeItem[]) =>
  items.reduce(
    (sum, item) => sum + Number(item.valueAtTrade ?? item.product?.price ?? 0),
    0,
  );

type MoneyCell = { label: string; amount: number };

function MoneySide({ value }: { value?: MoneyCell }) {
  return value ? (
    <>
      <span className="whitespace-nowrap text-muted">{value.label}</span>
      <span className="whitespace-nowrap text-right tabular-nums">
        {fmtTry(value.amount)}
      </span>
    </>
  ) : (
    <>
      <span aria-hidden />
      <span aria-hidden />
    </>
  );
}

function PairedMoneyLine({
  left,
  right,
  total = false,
}: {
  left?: MoneyCell;
  right?: MoneyCell;
  total?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(max-content,1fr)_7rem_minmax(max-content,1fr)_7rem] items-baseline gap-x-4 py-0.5 text-sm ${
        total ? "mt-1 border-t border-border-subtle pt-1 font-medium" : ""
      }`}
    >
      <MoneySide value={left} />
      <MoneySide value={right} />
    </div>
  );
}

type PartyCosts = {
  commission: number;
  shipping: number;
  cashDifference: number;
  total: number;
  status?: string;
};

function costsFromPayment(payment?: TradeCashPayment): PartyCosts | undefined {
  if (!payment) return undefined;
  return {
    commission:
      Number(payment.tradeFeeAmount ?? 0) + Number(payment.commission ?? 0),
    shipping: Number(payment.shippingAmount ?? 0),
    cashDifference: Number(payment.amount ?? 0),
    total: Number(payment.totalAmount ?? 0),
    status: payment.status,
  };
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
  // Tahsilat oluştuysa snapshot satırları, henüz kabul edilmediyse canlı fiyat
  // teklifi gösterilir. Böylece bekleyen takasta da komisyon ve kargo görünür.
  const payments = trade.cashPayments?.length
    ? trade.cashPayments
    : trade.cashPayment
      ? [trade.cashPayment]
      : [];
  const initiatorCosts =
    costsFromPayment(
      payments.find((payment) => payment.payerId === trade.initiator.id),
    ) ??
    (trade.paymentQuote
      ? {
          commission: trade.paymentQuote.initiator.serviceFee,
          shipping: trade.paymentQuote.initiator.shipping,
          cashDifference: trade.paymentQuote.initiator.cashDifference,
          total: trade.paymentQuote.initiator.total,
        }
      : undefined);
  const receiverCosts =
    costsFromPayment(
      payments.find((payment) => payment.payerId === trade.receiver.id),
    ) ??
    (trade.paymentQuote
      ? {
          commission: trade.paymentQuote.receiver.serviceFee,
          shipping: trade.paymentQuote.receiver.shipping,
          cashDifference: trade.paymentQuote.receiver.cashDifference,
          total: trade.paymentQuote.receiver.total,
        }
      : undefined);
  const productRowCount = Math.max(
    trade.initiatorItems.length,
    trade.receiverItems.length,
  );

  return (
    <SectionCard title={t("admin.operations.trades.balance.title")}>
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-[minmax(max-content,1fr)_7rem_minmax(max-content,1fr)_7rem] gap-x-4 text-sm font-medium text-heading">
            <span>{t("admin.operations.trades.balance.offeredTotal")}</span>
            <span />
            <span>{t("admin.operations.trades.balance.counterTotal")}</span>
            <span />
          </div>
          {Array.from({ length: productRowCount }, (_, index) => {
            const offered = trade.initiatorItems[index];
            const counter = trade.receiverItems[index];
            return (
              <PairedMoneyLine
                key={`${offered?.id ?? "blank"}-${counter?.id ?? "blank"}`}
                left={
                  offered
                    ? {
                        label: offered.product?.title,
                        amount: Number(
                          offered.valueAtTrade ?? offered.product?.price ?? 0,
                        ),
                      }
                    : undefined
                }
                right={
                  counter
                    ? {
                        label: counter.product?.title,
                        amount: Number(
                          counter.valueAtTrade ?? counter.product?.price ?? 0,
                        ),
                      }
                    : undefined
                }
              />
            );
          })}
          <PairedMoneyLine
            total
            left={{ label: t("common.total"), amount: offeredTotal }}
            right={{ label: t("common.total"), amount: counterTotal }}
          />
        </div>
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

      {(initiatorCosts || receiverCosts) && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-heading">
            {t("admin.operations.trades.balance.paymentsTitle")}
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-[minmax(max-content,1fr)_7rem_minmax(max-content,1fr)_7rem] gap-x-4 text-sm font-medium text-heading">
                <span>{trade.initiator.displayName}</span>
                <span className="text-right text-muted">
                  {initiatorCosts?.status
                    ? enumLabel(
                        paymentStatusConfig,
                        initiatorCosts.status,
                        initiatorCosts.status,
                      )
                    : ""}
                </span>
                <span>{trade.receiver.displayName}</span>
                <span className="text-right text-muted">
                  {receiverCosts?.status
                    ? enumLabel(
                        paymentStatusConfig,
                        receiverCosts.status,
                        receiverCosts.status,
                      )
                    : ""}
                </span>
              </div>
              <PairedMoneyLine
                left={
                  initiatorCosts
                    ? {
                        label: t("admin.operations.trades.balance.commission"),
                        amount: initiatorCosts.commission,
                      }
                    : undefined
                }
                right={
                  receiverCosts
                    ? {
                        label: t("admin.operations.trades.balance.commission"),
                        amount: receiverCosts.commission,
                      }
                    : undefined
                }
              />
              <PairedMoneyLine
                left={
                  initiatorCosts
                    ? {
                        label: t("trade.shippingFee"),
                        amount: initiatorCosts.shipping,
                      }
                    : undefined
                }
                right={
                  receiverCosts
                    ? {
                        label: t("trade.shippingFee"),
                        amount: receiverCosts.shipping,
                      }
                    : undefined
                }
              />
              <PairedMoneyLine
                left={
                  initiatorCosts?.cashDifference
                    ? {
                        label: t("trade.cashDifferenceLine"),
                        amount: initiatorCosts.cashDifference,
                      }
                    : undefined
                }
                right={
                  receiverCosts?.cashDifference
                    ? {
                        label: t("trade.cashDifferenceLine"),
                        amount: receiverCosts.cashDifference,
                      }
                    : undefined
                }
              />
              <PairedMoneyLine
                total
                left={
                  initiatorCosts
                    ? {
                        label: t(
                          "admin.operations.trades.balance.chargedTotal",
                        ),
                        amount: initiatorCosts.total,
                      }
                    : undefined
                }
                right={
                  receiverCosts
                    ? {
                        label: t(
                          "admin.operations.trades.balance.chargedTotal",
                        ),
                        amount: receiverCosts.total,
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
