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
import { statusLabel } from "@/lib/statusLabels";

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
  // Son BAŞARILI aramanın kimliği — iptal akışı (sipariş no + e-posta ile aynı
  // doğrulama) ve iptal sonrası tazeleme bu değerlerle çalışır.
  const [lastValues, setLastValues] = useState<TrackOrderValues | null>(null);

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
          ? t("order.notFoundCheckDetails")
          : err.response?.data?.message || t("order.loadFailed"),
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
      onSuccess: () =>
        setLastValues({
          orderNumber: values.orderNumber.trim(),
          email: values.email.trim().toLowerCase(),
        }),
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

  // Etiket TEK kaynaktan gelir: paylaşılan harita anahtarı taşır, metni katalog
  // verir. Eskiden burada elle yazılmış bir İngilizce harita vardı ve yeni bir
  // sipariş durumu eklendiğinde sessizce Türkçe kalıyordu.
  const getOrderStatusLabel = (s: string) =>
    statusLabel(orderStatusConfig, s, t, s);

  return {
    order: track.data ?? null,
    loading: track.isPending,
    error,
    getOrderStatusLabel,
    lookup,
    /** Doğrulanmış sipariş no + e-posta (iptal akışı bu kimliği kullanır). */
    lastValues,
    /** İptal sonrası takip verisini aynı kimlikle tazeler. */
    refresh: () => {
      if (lastValues) lookup(lastValues);
    },
    reset: () => {
      track.reset();
      setError("");
      setLastValues(null);
    },
    /** Prefill values from the URL (so `useZodForm` seeds them). */
    initialValues: {
      orderNumber: searchParams.get("orderNumber") || "",
      email: searchParams.get("email") || "",
    } as TrackOrderValues,
  };
}
