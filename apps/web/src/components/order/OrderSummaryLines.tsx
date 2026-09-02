/** @format */

"use client";

import { useTranslations } from "next-intl";

/**
 * Sipariş özeti satırları — sepet ve checkout için TEK bileşen.
 *
 * İki ekran aynı özeti ayrı ayrı çiziyordu: satır sırası, etiketler ve KDV'nin
 * hangi satıra katıldığı farklıydı, bu yüzden aynı sepet iki ekranda iki farklı
 * tutar gösterebiliyordu. Kalem sırası ve biçimi artık yalnız burada tanımlı.
 *
 * Tutarların HİÇBİRİ burada hesaplanmaz — hepsi `POST /orders/quote`'tan gelir.
 * Kargo ve hizmet bedeli KDV DAHİL verilir ki dört satırın toplamı `total`'ı
 * birebir versin.
 */

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * `POST /orders/quote` → `pricing.summary` ile AYNI şekil.
 *
 * Ekran hiçbir tutar türetmez; API ne gönderdiyse onu basar. KDV'yi kalemlere
 * API dağıtır — kargo satırı tarifeden gelen SABİT tutardır (KDV'siz), hizmet
 * KDV'sinin tamamı (kargo payınınki dahil) hizmet bedeli satırına yazılır — ve
 * üç satırın toplamının `total`'a eşit olduğu API testinde sabittir. Ekranlar
 * bu dağıtımı kendileri yaptığında aynı sepet sepette, checkout'ta ve sipariş
 * detayında farklı kırılım gösteriyordu.
 */
export interface OrderSummaryAmounts {
  productAmount: number;
  shippingAmount: number;
  serviceFeeAmount: number;
  total: number;
  /**
   * Platformun bu sepette size verdiği bedel indirimleri. Ürün/kargo/hizmet
   * satırları zaten indirimli tutarı gösterir; bu satırlar kazancın KAYNAĞINI
   * söyler, yoksa indirim görünmeden erirdi.
   */
  feeDiscounts?: Array<{
    target: string;
    name: string;
    code: string | null;
    amount: number;
  }>;
  feeDiscountTotal?: number;
  /**
   * Adet kampanyası (bogo/bulk) kazancı. Ürün satırı zaten indirimli tutarı
   * gösterir; bu satır "2 al 1 öde" kazancının kaynağını söyler — yoksa
   * indirim etiketsiz erirdi.
   */
  quantityDiscount?: number;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function OrderSummaryLines({
  amounts,
  loading,
  children,
}: {
  amounts: OrderSummaryAmounts | null;
  loading?: boolean;
  /** İndirim/kupon satırları — ürün ile kargo arasına girer. */
  children?: React.ReactNode;
}) {
  const t = useTranslations();
  // Tutar yoksa satır GİZLENMEZ; boş olduğu belli olsun diye tire gösterilir.
  const amount = (value: number | undefined) =>
    loading || amounts == null ? "—" : `${fmtTL(value ?? 0)} TL`;

  return (
    <div className="space-y-3 text-sm">
      <Line
        label={t("checkout.productFee")}
        value={amount(amounts?.productAmount)}
      />

      {(amounts?.quantityDiscount ?? 0) > 0 && (
        <div className="flex justify-between text-success-600">
          <span>{t("checkout.quantityCampaignDiscount")}</span>
          <span className="font-medium">
            −{fmtTL(amounts!.quantityDiscount!)} TL
          </span>
        </div>
      )}

      {children}

      <Line
        label={t("checkout.shippingFee")}
        value={amount(amounts?.shippingAmount)}
      />
      <Line
        label={t("checkout.serviceFee")}
        value={amount(amounts?.serviceFeeAmount)}
      />

      {/* Kampanya satırları: hangi bedelden ne kadar indiği, kimin verdiğiyle
          birlikte. Tutar zaten yukarıdaki satırlardan düşülmüştür. */}
      {(amounts?.feeDiscounts ?? []).map((discount) => (
        <div
          key={`${discount.target}:${discount.name}`}
          className="flex justify-between text-success-600"
        >
          <span>
            {discount.name}
            {discount.code ? ` (${discount.code})` : ""}
          </span>
          <span className="font-medium">−{fmtTL(discount.amount)} TL</span>
        </div>
      ))}

      <hr />

      <div className="flex justify-between text-lg">
        <span className="font-semibold">{t("checkout.total")}</span>
        <span className="font-bold text-primary-500">
          {amount(amounts?.total)}
        </span>
      </div>

      {(amounts?.feeDiscountTotal ?? 0) > 0 && (
        <div className="flex justify-between text-sm text-success-600">
          <span className="font-medium">{t("checkout.campaignSavings")}</span>
          <span className="font-semibold">
            {fmtTL(amounts!.feeDiscountTotal!)} TL
          </span>
        </div>
      )}
    </div>
  );
}
