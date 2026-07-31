/** @format */

"use client";

import Image from "next/image";
import { TagIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/ui";
import { buildOrderBreakdown } from "@tarodan/shared";
import { useCheckout } from "../_context/CheckoutContext";
import CouponBox from "../../cart/_components/CouponBox";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function OrderSummarySidebar() {
  const { t, checkoutItems } = useCheckout();

  return (
    <SectionCard
      title={t("checkout.orderSummary")}
      className="p-6 sticky top-24"
    >
      {/* Items Preview */}
      <div className="space-y-3 mb-4">
        {checkoutItems.slice(0, 3).map((item) => (
          <div key={item.id} className="flex gap-3">
            <div className="w-12 h-12 rounded overflow-hidden bg-surface-alt">
              <Image
                src={item.imageUrl}
                alt={item.title}
                width={48}
                height={48}
                className="object-cover w-full h-full"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              {item.originalPrice != null &&
                item.originalPrice > item.price && (
                  <p className="text-xs text-subtle line-through">
                    {fmtTL(item.originalPrice)} TL
                  </p>
                )}
              <p className="text-sm text-body font-medium">
                {fmtTL(item.price)} TL
              </p>
              {item.quantity > 1 ? (
                <p className="mt-1 text-xs text-muted">
                  {t("checkout.quantityLabel", { count: item.quantity })}
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {checkoutItems.length > 3 && (
          <p className="text-sm text-muted">
            +{checkoutItems.length - 3} ürün daha
          </p>
        )}
      </div>

      <hr className="my-4" />

      <CouponBox />

      <hr className="my-4" />

      <SummaryLines />
    </SectionCard>
  );
}

/**
 * Ödeme özeti: ürün ücreti + kargo ücreti + platform bedeli, altta ödenecek
 * tutar. Satırların toplamı ödenecek tutarı BİREBİR vermek zorunda, bu yüzden
 * kargo ve platform satırları KDV DAHİL gösterilir — hizmet KDV'si ayrı bir
 * satır olarak dökülse alıcı için gürültü olur, hiç gösterilmezse satırlar
 * toplamı tutmaz (quote'un hizmet KDV'sini atladığı dönemdeki hata buydu).
 *
 * Kargo ya da platform bedeli 0 olduğunda satır gizlenmez; ₺0,00 gösterilir.
 */
function SummaryLines() {
  const {
    t,
    quote,
    quoteLoading,
    subtotal,
    shippingCost,
    shippingLoading,
    couponDiscount,
    appliedCouponCode,
    grandTotal,
  } = useCheckout();

  const pricing = quote?.pricing;
  const loading = quoteLoading || (shippingLoading && !quote);

  // Kalem KDV'leri ORTAK primitiften gelir: ekran kendi KDV aritmetiğini yazmaz.
  const breakdown = buildOrderBreakdown({
    subtotal: pricing?.subtotal ?? subtotal ?? 0,
    buyerShippingAmount: pricing?.shippingAmount ?? shippingCost ?? 0,
    buyerCommissionAmount: pricing?.buyerFeeAmount ?? 0,
    serviceVatRate: pricing?.serviceVatRate ?? 0,
  });
  // buyerFeeAmount = alıcı komisyonu + hizmet bedeli; primitife tek kalem olarak
  // verildiği için ilk satır platform bedelinin tamamını taşır.
  const [platformLine, shippingLine] = breakdown.buyer.lines;
  const shippingWithVat = shippingLine.amount + shippingLine.vat;
  const platformWithVat = platformLine.amount + platformLine.vat;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between">
        <span className="text-muted">{t("checkout.productFee")}</span>
        <span className="font-medium">{fmtTL(breakdown.subtotal)} TL</span>
      </div>

      <div className="flex justify-between">
        <span className="text-muted">{t("checkout.shippingFee")}</span>
        <span className="font-medium">
          {loading ? (
            <span className="text-subtle">{t("common.loading")}</span>
          ) : (
            `${fmtTL(shippingWithVat)} TL`
          )}
        </span>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-muted flex items-center gap-1">
          {t("checkout.platformFee")}
          <a
            href="/platform-service-fee"
            target="_blank"
            rel="noopener noreferrer"
            className="text-info-600 hover:text-info-700 text-xs underline"
            title={t("common.learnMore")}
          >
            ?
          </a>
        </span>
        <span className="font-medium">
          {loading ? (
            <span className="text-subtle">{t("common.loading")}</span>
          ) : (
            `${fmtTL(platformWithVat)} TL`
          )}
        </span>
      </div>

      {couponDiscount > 0 && (
        <div className="flex justify-between text-success-600">
          <span className="flex items-center gap-1">
            <TagIcon className="w-3.5 h-3.5 shrink-0" />
            {appliedCouponCode
              ? `Kupon (${appliedCouponCode})`
              : t("checkout.discountLabel")}
          </span>
          <span className="font-medium">-{fmtTL(couponDiscount)} TL</span>
        </div>
      )}

      <hr />
      <div className="flex justify-between text-lg">
        <span className="font-semibold">{t("checkout.buyerPayable")}</span>
        <span className="font-bold text-primary-500">
          {loading ? (
            <span className="text-subtle">...</span>
          ) : (
            `${fmtTL(grandTotal)} TL`
          )}
        </span>
      </div>
      <p className="text-xs text-subtle">{t("checkout.vatIncluded")}</p>
    </div>
  );
}
