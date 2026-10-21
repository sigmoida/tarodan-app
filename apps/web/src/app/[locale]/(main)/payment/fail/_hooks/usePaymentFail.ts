/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { paymentsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useLocale } from "next-intl";
import {
  PAYMENT_CANCELLED_PARAM,
  PAYMENT_TYPE_PARAM,
  paymentKind,
  paymentReturnRoutes,
} from "../../_lib/paymentKind";

const urlHasGuest = () =>
  typeof window !== "undefined" &&
  window.location.search.includes("guest=true");

type Phase = "auth-loading" | "loading" | "ready";

/**
 * Loads the failed payment's status and, if still pending (callback not yet
 * in), releases the reservation at once (`confirm-failed`, a no-op while the
 * 3DS charge may still be live). A payment that turns out completed goes to
 * its success page instead of showing a failure. The kind (checkout,
 * membership, boost) picks the view and every route (`paymentReturnRoutes`).
 */
export function usePaymentFail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const locale = useLocale();

  const paymentId = searchParams.get("paymentId");
  const isGuestCheckout = searchParams.get("guest") === "true";
  const typeParam = searchParams.get(PAYMENT_TYPE_PARAM);

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const redirectingRef = useRef(false);

  const kind = paymentKind(typeParam, payment);
  const routesFor = (data: any, guest: boolean) =>
    paymentReturnRoutes(paymentKind(typeParam, data), {
      paymentId,
      guest,
      boostProductId: data?.boost?.productId,
    });
  const routes = routesFor(payment, isGuestCheckout || urlHasGuest());
  // The buyer's own cancel on the pay page (boost has a view for it).
  const cancelled =
    kind === "boost" && searchParams.get(PAYMENT_CANCELLED_PARAM) === "true";

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
      const data = response.data;
      setPayment(data);
      if (data?.status === "completed") {
        // Paid after all (e.g. a cancel that lost the race to the callback).
        redirectingRef.current = true;
        router.replace(routesFor(data, isGuest).success);
        return;
      }
      if (data?.status === "pending") {
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
    authLoading && !guestOk
      ? "auth-loading"
      : isLoading || redirectingRef.current
        ? "loading"
        : "ready";

  return {
    phase,
    payment,
    locale,
    isGuestCheckout,
    kind,
    routes,
    cancelled,
  };
}
