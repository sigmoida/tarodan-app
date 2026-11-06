/** @format */

import { Badge } from "@tarodan/ui";
import type { InstallmentOption } from "@tarodan/types";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui";
import { formatPriceNumber, formatTL } from "@/lib/format";

/** Takas ödemesinin kalemleri (API `pricing` alanı). */
export interface TradePricingLines {
  serviceFee: number;
  shippingAmount: number;
  cashDifference: number;
  totalAmount: number;
}

/**
 * Ödenecek tutar + (takas ödemesinde) tutarın kalemleri.
 *
 * Takasta tahsilat üç kalemden oluşur: hizmet bedeli + 2 bacaklık kargo +
 * varsa nakit fark. Tek rakam gösterildiğinde kullanıcı ödeme ekranında neyin
 * karşılığında para çekildiğini göremiyordu. Kalemler API'den gelir; ekran
 * kendi hesabını YAPMAZ.
 */
export default function AmountSummaryCard({
  amount,
  pricing,
  installment,
}: {
  amount?: number;
  pricing?: TradePricingLines | null;
  /**
   * The chosen installment (count above 1): the amount due becomes its total
   * C and the installment fee gets its own line. Amounts are the server's.
   */
  installment?: InstallmentOption | null;
}) {
  const t = useTranslations();
  // Hizmet bedeli ve kargo yapısal kalemlerdir: 0 olsalar da gösterilirler ki
  // "ücret alınmıyor" ile "ücret bilinmiyor" ayırt edilebilsin. Nakit fark ise
  // gerçekten koşulludur (her takasta yoktur).
  const lines = pricing
    ? [
        [t("trade.serviceFee"), pricing.serviceFee, true],
        [t("trade.shippingFee"), pricing.shippingAmount, true],
        [t("trade.cashDifferenceLine"), pricing.cashDifference, false],
      ].filter(([, value, always]) => always || (value as number) > 0)
    : [];
  const due = installment ? installment.totalAmount : amount;

  return (
    <SectionCard className="p-0" bodyClassName="">
      <div className="flex items-center justify-between gap-4 p-6 pb-4">
        <div>
          <p className="text-sm text-muted">
            {t("page.payment.amountsummarycard.odenecekTutar")}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-heading tabular-nums sm:text-4xl">
            {/* The number alone: the unit is its own smaller span (formatTL
                would print "TL" twice). */}
            {formatPriceNumber(due)}{" "}
            <span className="text-2xl font-semibold text-muted">
              {t("page.payment.amountsummarycard.tl")}
            </span>
          </p>
        </div>
        <Badge variant="warning">
          {t("page.payment.amountsummarycard.odemeBekleniyor")}
        </Badge>
      </div>
      {installment && (
        <div
          className="space-y-1 border-t border-border px-6 py-4"
          data-testid="installment-summary"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">
              {t("payment.installments.count", { count: installment.count })}
            </span>
            <span className="font-medium text-body tabular-nums">
              {t("payment.installments.monthly", {
                count: installment.count,
                amount: formatTL(installment.monthlyAmount),
              })}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">
              {t("payment.summary.installmentFee")}
            </span>
            <span className="font-medium text-body tabular-nums">
              {installment.feeAmount > 0
                ? formatTL(installment.feeAmount)
                : t("payment.installments.noFee")}
            </span>
          </div>
        </div>
      )}
      {lines.length > 0 && (
        <div className="space-y-1 border-t border-border px-6 py-4">
          {lines.map(([label, value]) => (
            <div
              key={label as string}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted">{label as string}</span>
              <span className="font-medium text-body tabular-nums">
                {formatTL(value as number)}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
