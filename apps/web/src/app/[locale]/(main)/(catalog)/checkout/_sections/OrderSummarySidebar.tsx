/** @format */

"use client";

import Image from "next/image";
import { TagIcon } from "@heroicons/react/24/outline";
import { QuantityStepper } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useCheckout } from "../_context/CheckoutContext";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function OrderSummarySidebar() {
  const {
    t,
    checkoutItems,
    isCartCheckout,
    directQuantity,
    setDirectQuantity,
    step,
    quote,
    quoteLoading,
    subtotal,
    shippingCost,
    shippingLoading,
    couponDiscount,
    appliedCouponCode,
    grandTotal,
  } = useCheckout();

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
              {/* Adet: "Hemen Al" ilk adımda düzenlenebilir stepper (stok-duyarlı);
                  sepet checkout'unda / sonraki adımlarda salt-okunur "Adet: N". */}
              {!isCartCheckout && step === 0 ? (
                <div className="mt-2">
                  <QuantityStepper
                    value={directQuantity}
                    max={item.maxQuantity}
                    onChange={setDirectQuantity}
                    size="sm"
                    decreaseLabel={t("cart.decreaseQuantity")}
                    increaseLabel={t("cart.increaseQuantity")}
                  />
                </div>
              ) : item.quantity > 1 ? (
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

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{t("checkout.subtotal")}</span>
          <span className="font-medium">
            {fmtTL(quote?.pricing?.subtotal ?? subtotal ?? 0)} TL
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted">Kargo (Sürat)</span>
          <span className="font-medium">
            {quoteLoading || (shippingLoading && !quote) ? (
              <span className="text-subtle">Hesaplanıyor...</span>
            ) : quote?.pricing?.shippingAmount != null ? (
              `${Number(quote.pricing.shippingAmount).toFixed(2)} TL`
            ) : shippingCost > 0 ? (
              `${shippingCost.toFixed(2)} TL`
            ) : (
              <span className="text-subtle">Adres seçin</span>
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

        {(quote?.pricing?.buyerFeeAmount ?? 0) > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-muted flex items-center gap-1">
              {t("checkout.platformServiceFeeWithRate")}
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
              {fmtTL(Number(quote!.pricing.buyerFeeAmount))} TL
            </span>
          </div>
        )}

        {(quote?.pricing?.taxAmount ?? 0) > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-muted">KDV</span>
            <span className="font-medium">
              {fmtTL(Number(quote!.pricing.taxAmount))} TL
            </span>
          </div>
        )}

        <hr />
        <div className="flex justify-between text-lg">
          <span className="font-semibold">{t("checkout.total")}</span>
          <span className="font-bold text-primary-500">
            {quoteLoading || (shippingLoading && !quote) ? (
              <span className="text-subtle">...</span>
            ) : (
              `${grandTotal.toFixed(2)} TL`
            )}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}
