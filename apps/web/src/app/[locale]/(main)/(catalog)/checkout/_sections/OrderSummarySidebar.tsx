/** @format */

"use client";

import Image from "next/image";
import { LockClosedIcon, TagIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import OrderSummaryLines from "@/components/order/OrderSummaryLines";
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

      <PayAction />
    </SectionCard>
  );
}

/**
 * Onay + ödeme — tutarın hemen altında. Mesafeli satış sözleşmesi onaylanmadan
 * düğme çalışmaz; onay siparişle birlikte sunucuya yazılır (zaman + sürüm
 * damgasını sunucu basar).
 */
function PayAction() {
  const {
    t,
    grandTotal,
    isLoading,
    card,
    distanceSalesAccepted,
    setDistanceSalesAccepted,
    handlePay,
  } = useCheckout();

  const busy = isLoading || card.processing;

  return (
    <div className="mt-5 space-y-3 border-t border-border-subtle pt-5">
      <Checkbox
        checked={distanceSalesAccepted}
        onChange={(e) => setDistanceSalesAccepted(e.target.checked)}
        label={t.rich("checkout.distanceSalesConsent", {
          contract: (chunks) => (
            <a
              href="/distance-sales"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-600 underline"
              onClick={(e) => e.stopPropagation()}
            >
              {chunks}
            </a>
          ),
        })}
      />

      <Button
        onClick={() => void handlePay()}
        disabled={busy || !distanceSalesAccepted}
        isLoading={busy}
        size="lg"
        className="w-full"
      >
        <span className="flex items-center justify-center gap-2">
          <LockClosedIcon className="h-5 w-5" />
          {t("checkout.payNow")} ({fmtTL(grandTotal)} TL)
        </span>
      </Button>
    </div>
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

  const loading = quoteLoading || (shippingLoading && !quote);
  // API'nin gönderdiği satırlar OLDUĞU GİBİ basılır — hesap yok, dağıtım yok.
  const amounts = quote?.pricing?.summary ?? null;

  return (
    <OrderSummaryLines loading={loading} amounts={amounts}>
      {couponDiscount > 0 && (
        <div className="flex justify-between text-success-600">
          <span className="flex items-center gap-1">
            <TagIcon className="w-3.5 h-3.5 shrink-0" />
            {appliedCouponCode
              ? `${t("checkout.discountLabel")} (${appliedCouponCode})`
              : t("checkout.discountLabel")}
          </span>
          <span className="font-medium">-{fmtTL(couponDiscount)} TL</span>
        </div>
      )}
    </OrderSummaryLines>
  );
}
