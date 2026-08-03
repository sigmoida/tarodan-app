/** @format */

"use client";

import Image from "next/image";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/ui";
import { useCheckout } from "../_context/CheckoutContext";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Ödenecek ürünler — sayfanın en üstünde, "ne için ödüyorum" sorusuna cevap.
 *
 * Kapsam sepetin tamamı DEĞİL: seçili satırlar, "Hemen Al" ile gelindiyse tek
 * ürün. Kapsam daraldıysa bunu açıkça yazarız, aksi halde kullanıcı sepetindeki
 * diğer ürünlerin de ödendiğini sanır.
 */
export default function OrderItemsCard() {
  const { t, checkoutItems, isBuyNow } = useCheckout();

  return (
    <SectionCard title={t("checkout.orderSummary")}>
      {isBuyNow && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-info-50 p-3 text-sm text-info-800">
          <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{t("checkout.buyNowNotice")}</span>
        </div>
      )}

      <div className="space-y-3">
        {checkoutItems.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 rounded-lg border border-border-subtle p-3"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-surface-alt">
              <Image
                src={item.imageUrl}
                alt={item.title}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-heading">{item.title}</p>
              <p className="text-sm text-muted">
                {t("product.seller")}: {item.seller.displayName}
              </p>
              {item.quantity > 1 && (
                <p className="text-sm text-muted">
                  {t("checkout.quantityLabel", { count: item.quantity })}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              {item.originalPrice != null &&
                item.originalPrice > item.price && (
                  <p className="text-sm text-subtle line-through">
                    {fmtTL(item.originalPrice)} TL
                  </p>
                )}
              <p className="font-semibold text-primary-600">
                {fmtTL(item.price * item.quantity)} TL
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
