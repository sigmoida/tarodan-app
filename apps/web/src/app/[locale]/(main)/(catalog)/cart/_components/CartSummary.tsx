/** @format */

"use client";

import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";

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

export default function CartSummary({
  subtotal,
  appliedDiscounts,
  buyerFee,
  grandTotal,
  isAuthenticated,
  canCheckout,
}: {
  subtotal: number;
  appliedDiscounts?: AppliedDiscount[];
  buyerFee: number;
  grandTotal: number;
  isAuthenticated: boolean;
  canCheckout: boolean;
}) {
  const t = useTranslations();

  // Automatic campaign discounts (those without a coupon code).
  const autoDiscounts = (appliedDiscounts ?? []).filter((d) => !d.discountCode);

  return (
    <SectionCard title={t("checkout.orderSummary")} className="sticky top-24">
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{t("checkout.subtotal")}</span>
          <span className="font-medium">{fmtTL(subtotal ?? 0)} TL</span>
        </div>

        {autoDiscounts.map((d) => (
          <div
            key={d.discountId}
            className="flex justify-between text-success-600"
          >
            <span>{d.discountName}</span>
            <span className="font-medium">
              -{fmtTL(Number(d.appliedAmount))} TL
            </span>
          </div>
        ))}

        {buyerFee > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">{t("footer.platformServiceFee")}</span>
            <span className="font-medium">{fmtTL(buyerFee)} TL</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-muted">{t("checkout.shipping")}</span>
          <span className="text-subtle">
            {t("checkout.shippingCalculatedAtCheckout")}
          </span>
        </div>

        <hr className="my-1" />

        <div className="flex justify-between text-lg">
          <span className="font-semibold">{t("checkout.total")}</span>
          <span className="font-bold text-primary-500">
            {fmtTL(grandTotal ?? 0)} TL
          </span>
        </div>
      </div>

      {canCheckout ? (
        <ButtonLink href="/checkout" className="w-full mt-6 flex gap-2">
          {t("cart.proceedToCheckout")}
        </ButtonLink>
      ) : (
        <Button disabled className="w-full mt-6 flex gap-2">
          {t("cart.proceedToCheckout")}
        </Button>
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
