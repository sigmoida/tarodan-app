/** @format */

"use client";

import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import OrderSummaryLines from "@/components/order/OrderSummaryLines";
import type { OrderSummaryAmounts } from "@/components/order/OrderSummaryLines";
import CouponBox from "./CouponBox";

interface AppliedDiscount {
  discountId: string;
  discountName: string;
  discountCode?: string | null;
  appliedAmount: number | string;
}

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Sepet özeti — tutarların HİÇBİRİ burada hesaplanmaz. `quote` doğrudan
 * `POST /orders/quote`'tan gelir; ürünün tabi olduğu komisyon kuralı, hizmet
 * KDV'si ve kargo hep o tek hesaptan çıkar. `subtotal` yalnız quote henüz
 * dönmediğinde gösterilecek yedek değerdir.
 */
export default function CartSummary({
  subtotal,
  appliedDiscounts,
  quote,
  isAuthenticated,
  canCheckout,
  selectedCount,
}: {
  subtotal: number;
  appliedDiscounts?: AppliedDiscount[];
  quote: OrderSummaryAmounts | null;
  isAuthenticated: boolean;
  canCheckout: boolean;
  /** Ödemeye taşınacak satır sayısı — başlıkta ve boş-seçim uyarısında. */
  selectedCount: number;
}) {
  const t = useTranslations();

  // Automatic campaign discounts (those without a coupon code).
  const autoDiscounts = (appliedDiscounts ?? []).filter((d) => !d.discountCode);

  return (
    <SectionCard title={t("checkout.orderSummary")} className="sticky top-24">
      <OrderSummaryLines amounts={quote}>
        {autoDiscounts.map((d) => (
          <div
            key={d.discountId ?? d.discountName}
            className="flex justify-between text-success-600"
          >
            <span>{d.discountName}</span>
            <span className="font-medium">
              -{fmtTL(Number(d.appliedAmount))} TL
            </span>
          </div>
        ))}
      </OrderSummaryLines>

      <div className="mt-5 border-t border-border-subtle pt-5">
        <CouponBox />
      </div>

      {canCheckout ? (
        <ButtonLink href="/cart/payment" className="w-full mt-6 flex gap-2">
          {t("cart.proceedToCheckout")}
        </ButtonLink>
      ) : (
        <Button disabled className="w-full mt-6 flex gap-2">
          {t("cart.proceedToCheckout")}
        </Button>
      )}
      {selectedCount === 0 && (
        <p className="mt-2 text-center text-xs text-muted">
          {t("cart.selectItemsToCheckout")}
        </p>
      )}

      {!isAuthenticated && (
        <div className="mt-3 space-y-2">
          <ButtonLink
            variant="secondary"
            href={`/login?redirect=${encodeURIComponent("/cart")}`}
            className="w-full flex gap-2"
          >
            <LockClosedIcon className="w-4 h-4" />
            {t("checkout.loginFasterCheckout")}
          </ButtonLink>
          <p className="text-xs text-muted text-center">
            {t("checkout.cartSavedAfterLogin")}
          </p>
        </div>
      )}

      <ButtonLink
        variant="ghost"
        href="/listings"
        className="w-full mt-4 text-muted"
      >
        {t("cart.continueShopping")}
      </ButtonLink>
    </SectionCard>
  );
}
