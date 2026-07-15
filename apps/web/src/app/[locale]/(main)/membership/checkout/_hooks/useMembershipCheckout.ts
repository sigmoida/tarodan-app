/** @format */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { queryKeys } from "@/lib/query/keys";
import { membershipApi, api, paymentsApi } from "@/lib/api";
import { tierChangeKind } from "../../_lib/membershipTiers";
import { useAuthStore } from "@/stores/authStore";
import {
  TIER_FEATURES,
  TIER_NAMES,
  PAID_TIERS,
  type TierInfo,
} from "../_lib/tiers";

interface TierRow {
  type: string;
  monthlyPrice: number | string;
  yearlyPrice: number | string;
}

/**
 * The membership-checkout data + payment flow. Tiers and the current membership
 * are read via TanStack Query (the DB tier is the single price source the backend
 * charges against); `handleSubmit` runs the subscribe → payment / bypass /
 * scheduled-downgrade branches.
 */
export function useMembershipCheckout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    isAuthenticated,
    isLoading: authLoading,
    user,
    refreshUserData,
  } = useAuthStore();

  const tier = searchParams.get("tier") || "premium";
  const period = (searchParams.get("period") || "monthly") as
    "monthly" | "yearly";
  const required = searchParams.get("required") === "true";
  const isPaidTier = (PAID_TIERS as readonly string[]).includes(tier);

  const [isProcessing, setIsProcessing] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Redirect unauthenticated visitors to login (preserving the destination).
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(
        `/login?redirect=/membership/checkout?tier=${tier}&period=${period}`,
      );
    }
  }, [authLoading, isAuthenticated, tier, period, router]);

  const tiersQuery = useQuery({
    queryKey: queryKeys.membership.tiers(),
    queryFn: async (): Promise<TierRow[]> => {
      const r = await membershipApi.getTiers();
      return r.data?.data ?? r.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const meQuery = useQuery({
    queryKey: queryKeys.membership.me(),
    queryFn: async () => (await api.get("/membership/me")).data,
    enabled: isAuthenticated,
  });
  const currentTier: string =
    meQuery.data?.tier?.type ?? user?.membershipTier ?? "free";

  const tierRow = tiersQuery.data?.find((x) => x.type === tier);
  const tierInfo: TierInfo | null = useMemo(
    () =>
      isPaidTier && tierRow
        ? {
            name: TIER_NAMES[tier],
            price:
              period === "monthly"
                ? Number(tierRow.monthlyPrice)
                : Number(tierRow.yearlyPrice),
            basePrice: Number(tierRow.monthlyPrice),
            features: TIER_FEATURES[tier] || [],
          }
        : null,
    [isPaidTier, tierRow, tier, period],
  );

  // Guard against a mis-configured (absurd) price.
  useEffect(() => {
    if (tierInfo && tierInfo.price > 100000) {
      toast.error(
        `Fiyat çok yüksek görünüyor (${tierInfo.price.toLocaleString("tr-TR")} TL). Lütfen admin panelinden membership fiyatlarını kontrol edin.`,
        { duration: 10000 },
      );
    }
  }, [tierInfo]);

  const changeSuccessMessage = () =>
    tierChangeKind(currentTier, tier) === "upgrade"
      ? "Üyeliğiniz başarıyla yükseltildi!"
      : "Üyeliğiniz başarıyla değiştirildi!";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("Lütfen kullanım koşullarını kabul edin");
      return;
    }
    setIsProcessing(true);
    try {
      const response = await membershipApi.subscribe({
        tierType: tier,
        billingPeriod: period,
      });
      const data: any = response.data;
      const paymentId = data.paymentId;
      const orderId = data.orderId;
      const kind = tierChangeKind(currentTier, tier);

      // Test bypass: complete without PayTR.
      if (data.useBypass === true && paymentId) {
        await paymentsApi.bypassComplete(paymentId).catch(() => {});
        toast.success(changeSuccessMessage());
        await refreshUserData();
        router.push(`/membership/success?tier=${tier}&kind=${kind}`);
        return;
      }

      // Single payment surface: our in-site card page (3D Secure there).
      if (orderId) {
        const init = await paymentsApi.initiate(orderId, "paytr");
        const initData: any = init.data?.data ?? init.data ?? {};
        if (initData.paymentId) {
          router.push(
            `/payment/${initData.paymentId}?type=membership&kind=${kind}`,
          );
          return;
        }
      }

      if (paymentId) {
        router.push(`/payment/${paymentId}?type=membership&kind=${kind}`);
        return;
      }

      // Deferred downgrade: backend keeps the current plan until period end.
      if (data.scheduledTierType || data.scheduledBillingPeriod) {
        await refreshUserData();
        const isPeriodOnly = tier === currentTier;
        const q = isPeriodOnly
          ? `scheduled=1&period=${period}`
          : `tier=${tier}&kind=downgrade&scheduled=1`;
        router.push(`/membership/success?${q}`);
        return;
      }

      toast.success(changeSuccessMessage());
      await refreshUserData();
      router.push(`/membership/success?tier=${tier}&kind=${kind}`);
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Payment error:", error);
      toast.error(
        error.response?.data?.message ||
          "Ödeme işlemi başarısız oldu. Lütfen tekrar deneyin.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    tier,
    period,
    required,
    isPaidTier,
    isAuthenticated,
    authLoading,
    tiersLoading: tiersQuery.isLoading,
    tierInfo,
    agreed,
    setAgreed,
    isProcessing,
    handleSubmit,
  };
}
