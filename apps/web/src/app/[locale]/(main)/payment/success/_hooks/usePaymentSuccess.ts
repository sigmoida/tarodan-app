/** @format */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { paymentsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";

const urlHasGuest = () =>
  typeof window !== "undefined" &&
  window.location.search.includes("guest=true");

type Phase = "client-loading" | "auth-loading" | "loading" | "ready";

/**
 * Owns the payment-success lifecycle: verify retries, status fetch and the
 * guest/membership/trade redirects.
 *
 * Deliberately does NOT chase an invoice. A physical order is invoiced on
 * DELIVERY, so polling right after payment can never succeed — the screen just
 * spun and then showed an error. The invoice reaches the buyer by email when it
 * is issued, and stays available under Orders.
 */
export function usePaymentSuccess() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const t = useTranslations();
  const locale = useLocale();

  const paymentId = searchParams.get("paymentId");
  const isGuestCheckout = searchParams.get("guest") === "true";
  const isMembershipPayment = searchParams.get("type") === "membership";
  const orderIdFromUrl =
    searchParams.get("orderId") || searchParams.get("orderid");

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Auth store hydration differs SSR/client → defer auth-dependent UI until mount.
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => setClientReady(true), []);

  useEffect(() => {
    if (isMembershipPayment) {
      router.replace("/membership/success");
      return;
    }
    if (authLoading) return;

    if (!isAuthenticated && !isGuestCheckout && !urlHasGuest()) {
      router.push("/login");
      return;
    }
    if (paymentId) fetchPayment();
    else setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentId,
    authLoading,
    isAuthenticated,
    isGuestCheckout,
    isMembershipPayment,
  ]);

  const fetchPayment = async () => {
    try {
      // PayTR status-inquiry can lag; retry verify until completed (idempotent).
      for (let i = 0; i < 5; i++) {
        try {
          const res = await paymentsApi.verify(paymentId!);
          if (res.data?.completed) break;
        } catch {
          /* ignore — getStatus still pulls the current status */
        }
        if (i < 4) await new Promise((r) => setTimeout(r, 1200));
      }

      const isGuest = isGuestCheckout || urlHasGuest();
      const response = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId!)
        : await paymentsApi.getStatusLight(paymentId!);
      const paymentData = response.data;
      setPayment(paymentData);

      if (paymentData?.status === "failed") {
        router.replace(
          `/payment/fail?paymentId=${paymentId}${isGuest ? "&guest=true" : ""}`,
        );
        return;
      }
      if (paymentData?.isMembershipOrder) {
        router.replace("/membership/success");
        return;
      }
      if (paymentData?.tradeId) {
        router.replace(`/profile/trades/${paymentData.tradeId}?paid=1`);
        return;
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch payment:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const guestOk = isGuestCheckout || urlHasGuest();
  const phase: Phase = !clientReady
    ? "client-loading"
    : authLoading && !guestOk
      ? "auth-loading"
      : isLoading
        ? "loading"
        : "ready";

  return {
    phase,
    isCompleted: payment?.status === "completed",
    payment,
    isAuthenticated,
    orderIdFromUrl,
    t,
    locale,
  };
}
