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

type Phase = "auth-loading" | "loading" | "ready";

/** Loads the failed payment's status and, if still pending (callback not yet in),
 *  releases the reservation immediately. */
export function usePaymentFail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const locale = useLocale();

  const paymentId = searchParams.get("paymentId");
  const isGuestCheckout = searchParams.get("guest") === "true";

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated && !isGuestCheckout && !urlHasGuest()) {
      router.push("/login");
      return;
    }
    if (paymentId) fetchPayment();
    else setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, authLoading, isAuthenticated, isGuestCheckout]);

  const fetchPayment = async () => {
    try {
      const isGuest = isGuestCheckout || urlHasGuest();
      const response = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId!)
        : await paymentsApi.getStatusLight(paymentId!);
      setPayment(response.data);
      if (response.data?.status === "pending") {
        try {
          await paymentsApi.confirmFailed(paymentId!);
        } catch {
          /* silent — cron releases on expiry anyway */
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch payment:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const guestOk = isGuestCheckout || urlHasGuest();
  const phase: Phase =
    authLoading && !guestOk ? "auth-loading" : isLoading ? "loading" : "ready";

  return {
    phase,
    payment,
    locale,
    isGuestCheckout,
    handleRetry: () => router.push("/profile/orders"),
  };
}
