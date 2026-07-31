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
 * API dağıtır (kargonunki kargo satırına, ücretlerinki hizmet bedeline) ve üç
 * satırın toplamının `total`'a eşit olduğu API testinde sabittir. Ekranlar bu
 * dağıtımı kendileri yaptığında kargonun KDV'si ücret satırına yığılıyor, aynı
 * sepet sepette ve checkout'ta farklı kırılım gösteriyordu.
 */
export interface OrderSummaryAmounts {
  productAmount: number;
  shippingAmount: number;
  serviceFeeAmount: number;
  total: number;
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

      {children}

      <Line
        label={t("checkout.shippingFee")}
        value={amount(amounts?.shippingAmount)}
      />
      <Line
        label={t("checkout.serviceFee")}
        value={amount(amounts?.serviceFeeAmount)}
      />

      <hr />

      <div className="flex justify-between text-lg">
        <span className="font-semibold">{t("checkout.total")}</span>
        <span className="font-bold text-primary-500">
          {amount(amounts?.total)}
        </span>
      </div>
      <p className="text-xs text-subtle">{t("checkout.vatIncluded")}</p>
    </div>
  );
}
