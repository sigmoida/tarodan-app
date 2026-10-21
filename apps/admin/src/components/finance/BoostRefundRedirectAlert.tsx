"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import { TextLink } from "@/components/TextLink";
import { extractErrorI18nKey } from "@/lib/error";

/**
 * The generic refund paths (manual payment refund, order cancel and its
 * preview, refund request approval) refuse an order that carries a boost
 * with this key: a boost is refunded only by "refund and stop", so the money
 * never goes back while the boost keeps running (decision D16).
 */
const BOOST_REFUND_USE_BOOST_SCREEN =
  "server.admin.payment.boostRefundUseBoostScreen";

export function isBoostRefundRedirect(error: unknown): boolean {
  return extractErrorI18nKey(error) === BOOST_REFUND_USE_BOOST_SCREEN;
}

/** Points staff from a refused generic refund to the boost purchases screen. */
export function BoostRefundRedirectAlert() {
  const t = useTranslations();
  return (
    <Alert
      variant="info"
      action={
        <TextLink href="/marketing/boost-purchases">
          {t("admin.marketing.boostPurchases.title")}
        </TextLink>
      }
    >
      {t(BOOST_REFUND_USE_BOOST_SCREEN)}
    </Alert>
  );
}
