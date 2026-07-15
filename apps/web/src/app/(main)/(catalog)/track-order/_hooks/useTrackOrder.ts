"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { orderStatusConfig } from "@tarodan/ui";
import { ordersApi } from "@/lib/api";
import type { GuestOrderDetail } from "../_lib/types";
import type { TrackOrderValues } from "../_lib/schema";

const orderStatusEnLabels: Record<string, string> = {
  pending_payment: "Awaiting Payment",
  paid: "Paid",
  preparing: "Preparing",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refund_requested: "Refund Requested",
  refunded: "Refunded",
};

/**
 * Guest order-tracking data logic — the `trackGuest` lookup (via `useMutation`),
 * the URL-param auto-fetch, the status-label helper, and the inline error text.
 * The page owns only the zod form (order number + email) and calls `lookup`.
 */
export function useTrackOrder(locale: string) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [autoFetched, setAutoFetched] = useState(false);

  // Global onError sets the inline message (both the URL auto path and the form).
  const track = useMutation({
    mutationFn: (v: TrackOrderValues) =>
      ordersApi
        .trackGuest({
          orderNumber: v.orderNumber.trim(),
          email: v.email.trim().toLowerCase(),
        })
        .then((r) => r.data as GuestOrderDetail),
    onError: (err: any) => {
      setError(
        err.response?.status === 404
          ? locale === "en"
            ? "Order not found. Check your details."
            : "Sipariş bulunamadı. Bilgileri kontrol edin."
          : err.response?.data?.message ||
              (locale === "en"
                ? "Could not load order"
                : "Sipariş yüklenemedi"),
      );
    },
  });

  /** Run a lookup. `toastOnError` adds the manual-submit toast (URL auto path omits it). */
  const lookup = (
    values: TrackOrderValues,
    opts?: { toastOnError?: boolean },
  ) => {
    setError("");
    track.mutate(values, {
      onError: opts?.toastOnError
        ? (err: any) =>
            toast.error(err.response?.data?.message || t("order.orderNotFound"))
        : undefined,
    });
  };

  // Auto-lookup when the order number + email arrive via the URL (email links).
  useEffect(() => {
    const orderNumber = searchParams.get("orderNumber")?.trim();
    const email = searchParams.get("email")?.trim();
    if (!orderNumber || !email || !email.includes("@") || autoFetched) return;
    setAutoFetched(true);
    lookup({ orderNumber, email });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, autoFetched]);

  const getOrderStatusLabel = (s: string) =>
    locale === "en"
      ? orderStatusEnLabels[s] || s
      : orderStatusConfig[s]?.label || s;

  return {
    order: track.data ?? null,
    loading: track.isPending,
    error,
    getOrderStatusLabel,
    lookup,
    reset: () => {
      track.reset();
      setError("");
    },
    /** Prefill values from the URL (so `useZodForm` seeds them). */
    initialValues: {
      orderNumber: searchParams.get("orderNumber") || "",
      email: searchParams.get("email") || "",
    } as TrackOrderValues,
  };
}
