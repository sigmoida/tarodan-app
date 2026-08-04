/** @format */

import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui";
import { formatTL } from "@/lib/format";

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
}: {
  amount?: number;
  pricing?: TradePricingLines | null;
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

  return (
    <SectionCard className="p-0" bodyClassName="">
      <div className="flex items-center justify-between gap-4 p-6 pb-4">
        <div>
          <p className="text-sm text-muted">Ödenecek tutar</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-heading tabular-nums sm:text-4xl">
            {amount?.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span className="text-2xl font-semibold text-muted">TL</span>
          </p>
        </div>
        <Badge variant="warning">Ödeme bekleniyor</Badge>
      </div>
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
