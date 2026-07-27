/** @format */

"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "@tarodan/ui";
import { TagIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCart } from "@/hooks/useCart";
import { useTranslations } from "next-intl";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Cart coupon input. Self-contained island (reads `useCart` directly, so no prop
 * threading). Works for both authed users (server `/cart/coupon`) and guests
 * (offline coupon code, discount re-validated server-side against current items).
 */
export default function CouponBox() {
  const t = useTranslations();
  const {
    applyCoupon,
    removeCoupon,
    appliedCouponCode,
    couponDiscount,
    couponError,
  } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleApply = async () => {
    if (!code.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    const res = await applyCoupon(code);
    setSubmitting(false);
    if (res.success) {
      setCode("");
      toast.success(t("cart.couponApplied"));
    } else {
      // Hook returns the backend's localized message or empty; fall back to a
      // translated generic message.
      setError(res.error || t("cart.couponApplyError"));
    }
  };

  const handleRemove = async () => {
    setError(null);
    await removeCoupon();
  };

  if (appliedCouponCode) {
    return (
      <div className="rounded-lg border border-success-200 bg-success-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <TagIcon className="h-4 w-4 shrink-0 text-success-600" />
            <span className="truncate text-sm font-medium text-success-700">
              {appliedCouponCode}
            </span>
            {couponDiscount > 0 && (
              <span className="whitespace-nowrap text-sm text-success-600">
                −{fmtTL(couponDiscount)} TL
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            aria-label={t("cart.removeCoupon")}
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </div>
        {couponError && (
          <p className="mt-1 text-xs text-danger-600">{couponError}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t("cart.couponPlaceholder")}
          className="font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleApply();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleApply}
          isLoading={submitting}
          disabled={!code.trim()}
        >
          {t("cart.applyCoupon")}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
