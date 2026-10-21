/** @format */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import type { BoostPaymentSummary } from "@tarodan/types";
import {
  paymentCapabilities,
  paymentsApi,
  type PaymentConfig,
} from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { hasAuthMarker } from "@/lib/authMarker";
import { useTranslations } from "next-intl";
import {
  PAYMENT_TYPE_PARAM,
  paymentKind,
  paymentPurpose,
  paymentReturnRoutes,
  type PaymentKind,
} from "@/lib/paymentKind";

type Phase = "auth-loading" | "loading" | "notfound" | "ready";

const hasLocalToken = () => hasAuthMarker();
const urlHasGuest = () =>
  typeof window !== "undefined" &&
  window.location.search.includes("guest=true");

/**
 * Owns the payment-page lifecycle: loads public config + payment status, routes
 * completed/failed payments away, runs the dev bypass, and exposes the target +
 * cancel/retry actions. The page component stays presentational. Every route
 * comes from `paymentReturnRoutes` for the payment's kind (checkout,
 * membership, boost).
 */
export function usePaymentStatus() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const paymentId = params.id as string;
  const isGuestCheckout = searchParams.get("guest") === "true";
  const typeParam = searchParams.get(PAYMENT_TYPE_PARAM);
  // Membership only: the change kind its success page shows.
  const membershipChange = searchParams.get("kind");

  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cardStorageEnabled, setCardStorageEnabled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const redirectingRef = useRef(false);

  const routesFor = (
    kind: PaymentKind,
    data: { boost?: BoostPaymentSummary | null } | null,
    guest: boolean,
  ) =>
    paymentReturnRoutes(kind, {
      paymentId,
      guest,
      membershipChange,
      boostProductId: data?.boost?.productId,
    });

  const kind = paymentKind(typeParam, payment);
  const purpose = paymentPurpose(kind);
  const routes = routesFor(kind, payment, isGuestCheckout || urlHasGuest());

  const fetchPayment = async () => {
    const isGuest = isGuestCheckout || urlHasGuest();
    try {
      setIsLoading(true);

      let cfg: PaymentConfig = {
        bypassEnabled: false,
        cardStorageEnabled: false,
        recurringEnabled: false,
      };
      try {
        cfg = (await paymentsApi.getConfig()).data;
      } catch {
        /* safe default: new-card only, no bypass */
      }

      const response = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId)
        : await paymentsApi.getStatusLight(paymentId);
      const paymentData = response.data;
      setPayment(paymentData);
      // The store (and so card storage) follows the loaded kind: the URL may
      // lack `type`, for example after the login redirect.
      const loadedKind = paymentKind(typeParam, paymentData);
      setCardStorageEnabled(
        paymentCapabilities(cfg, paymentPurpose(loadedKind))
          .cardStorageEnabled && !isGuest,
      );

      if (loadedKind === "membership" && paymentData.status === "completed") {
        redirectingRef.current = true;
        router.replace(routesFor(loadedKind, paymentData, isGuest).success);
        return;
      }

      if (cfg.bypassEnabled && paymentData.status === "pending") {
        try {
          const bypassRes = await paymentsApi.bypassComplete(paymentId);
          if (bypassRes.data?.success) {
            toast.success(t("page.payment.usepaymentstatus.odemeBasarili"));
            redirectingRef.current = true;
            const hasSession = isAuthenticated || hasLocalToken();
            router.push(
              routesFor(loadedKind, paymentData, !hasSession).success,
            );
            return;
          }
        } catch {
          /* bypass failed → fall back to the card form */
        }
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error(
          t("page.payment.usepaymentstatus.failedToFetchPayment"),
          error,
        );
      toast.error(t("page.payment.usepaymentstatus.odemeBilgisiYuklenemedi"));
      redirectingRef.current = true;
      router.push(routesFor(paymentKind(typeParam), null, isGuest).exit);
    } finally {
      setIsLoading(false);
    }
  };

  // Auth gate + one-shot fetch (StrictMode double-effect guard).
  const startedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (
      !isAuthenticated &&
      !isGuestCheckout &&
      !urlHasGuest() &&
      !hasLocalToken()
    ) {
      router.push(`/login?redirect=/payment/${paymentId}`);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    fetchPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, authLoading, isAuthenticated, isGuestCheckout]);

  // Route finished payments away once status is known.
  useEffect(() => {
    if (!payment) return;
    if (payment.status === "completed") {
      redirectingRef.current = true;
      router.push(routes.success);
    } else if (payment.status === "failed") {
      redirectingRef.current = true;
      router.push(routes.fail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.status]);

  const handleCancel = async () => {
    setCancelling(true);
    const hasSession = isAuthenticated || hasLocalToken();
    try {
      if (hasSession) {
        await paymentsApi.cancel(paymentId);
        // The text says the goods are back on sale: checkout only. A boost
        // lands on its own cancelled view instead.
        if (kind === "checkout") {
          toast.success(
            t("page.payment.usepaymentstatus.odemeIptalEdildiUrunTekrarSatisa"),
          );
        }
      }
    } catch {
      /* silent: still navigate back */
    } finally {
      router.push(routesFor(kind, payment, isGuestCheckout).cancel);
    }
  };

  const directTarget = useMemo(
    () => ({
      ...(payment?.orderId ? { orderId: payment.orderId as string } : {}),
      ...(payment?.checkoutGroupId
        ? { checkoutGroupId: payment.checkoutGroupId as string }
        : {}),
      ...(payment?.tradeId ? { tradeId: payment.tradeId as string } : {}),
    }),
    [payment?.orderId, payment?.checkoutGroupId, payment?.tradeId],
  );
  const hasTarget =
    !!directTarget.orderId ||
    !!directTarget.checkoutGroupId ||
    !!directTarget.tradeId;

  const guestOk = isGuestCheckout || urlHasGuest();
  const phase: Phase =
    authLoading && !guestOk
      ? "auth-loading"
      : isLoading ||
          redirectingRef.current ||
          payment?.status === "completed" ||
          payment?.status === "failed"
        ? "loading"
        : !payment
          ? "notfound"
          : "ready";

  return {
    phase,
    payment,
    cardStorageEnabled,
    cancelling,
    handleCancel,
    retry: fetchPayment,
    directTarget,
    hasTarget,
    kind,
    routes,
    purpose,
  };
}
