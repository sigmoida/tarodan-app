import React, { useState, useEffect } from "react";
import { router, useFocusEffect } from "expo-router";
import { appAlert } from "@tarodan/ui-native";
import { useAuthStore } from "@/stores/authStore";
import { membershipApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  TIER_ORDER,
  TIER_FEATURES,
  mapTiersToSettings,
  getDefaultMonthly,
  type TierType,
  type MembershipDetails,
  type PlatformSettings,
} from "../_lib/membershipTiers";

/**
 * Membership screen controller — owns the membership + tiers fetch (verbatim
 * useState/useEffect/useFocusEffect flow, RQ migration deferred), billing-period
 * state, tier visibility/guard derivation, and price/limit/feature getters.
 */
export function useMembership() {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipDetails | null>(null);
  const [settings, setSettings] = useState<PlatformSettings>({});
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated]);

  // Ekrana her dönüşte güncel kademeyi çek (üyelik yükseltme sonrası "mevcut
  // plan" anında güncellensin; mount'ta da çalışır).
  useFocusEffect(
    React.useCallback(() => {
      if (isAuthenticated) fetchData();
    }, [isAuthenticated]),
  );

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    // allSettled: biri başarısız olsa diğeri (fiyatlar/üyelik) yine yüklensin.
    // Fiyat/limit TEK KAYNAĞI: DB MembershipTier (GET /membership/tiers) — backend
    // tahsilatı + web ile birebir aynı. Eskiden /admin/settings/public okunuyordu;
    // o anahtarlar seed'de yazılmadığı için fallback ₺499 (DB ₺249.99) gösteriyordu.
    const [membershipRes, tiersRes] = await Promise.allSettled([
      membershipApi.getCurrentMembership(),
      membershipApi.getTiers(),
    ]);
    if (membershipRes.status === "fulfilled") {
      setMembership(membershipRes.value.data);
    }
    if (tiersRes.status === "fulfilled") {
      const list = tiersRes.value.data?.data ?? tiersRes.value.data ?? [];
      setSettings(mapTiersToSettings(list));
    }
    if (membershipRes.status === "rejected" && tiersRes.status === "rejected") {
      console.error("Failed to load membership data:", membershipRes.reason);
      setError("Üyelik bilgileri yüklenemedi. Lütfen tekrar deneyin.");
    }
    setLoading(false);
  };

  const currentTier: TierType = (membership?.tier?.type as TierType) || "free";

  // Web ile aynı mantık (profile/membership/page.tsx): business tier yalnızca
  // kurumsal hesaplara (companyName + taxId) veya hâlihazırda business tier olan
  // kullanıcıya gösterilir. Bireysel hesaplar business kartını hiç görmez —
  // backend zaten 403 döndürür (membership.service.ts).
  const isBusinessAccount = !!(user?.companyName && user?.taxId);
  const isBusinessTier =
    currentTier === "business" || user?.membershipTier === "business";

  // Kurumsal hesap + business tier değil → BusinessMembershipGuard kullanıcıyı bu
  // ekrana kilitler (izinli yollar dışına çıkış engellenir; nereye gidilse tekrar
  // buraya yönlendirir). Bu durumda "normal geri" döngüye girer; tek geçerli çıkış
  // üyeliği tamamlamak ya da çıkış yapmaktır (/login izinli + logout guard'ı kapatır).
  const guardLocked = isBusinessAccount && !isBusinessTier;

  const handleBack = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)");

  // Kilitli kullanıcı için çıkış yolu: onaylı logout → giriş ekranı.
  const handleLockedExit = () =>
    appAlert(
      "Çıkış yap",
      "Kurumsal hesabınız için Business üyeliği tamamlanmadan uygulamayı kullanamazsınız. Çıkış yapmak ister misiniz?",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Çıkış yap",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/(auth)/login");
          },
        },
      ],
    );

  const visibleTiers: TierType[] =
    isBusinessAccount || isBusinessTier
      ? TIER_ORDER.filter((tier) => tier === "business")
      : TIER_ORDER.filter((tier) => tier !== "business");

  const getPrice = (tier: TierType): number => {
    if (tier === "free") return 0;
    const key =
      `${tier}_${billingPeriod === "monthly" ? "monthly" : "yearly"}_price` as keyof PlatformSettings;
    const price = settings[key] as number | undefined;
    if (price) return price;

    const monthlyKey = `${tier}_monthly_price` as keyof PlatformSettings;
    const monthlyPrice =
      (settings[monthlyKey] as number | undefined) ?? getDefaultMonthly(tier);
    if (billingPeriod === "yearly") {
      const discount = settings.yearly_discount_percentage ?? 20;
      return Math.round(monthlyPrice * 12 * (1 - discount / 100));
    }
    return monthlyPrice;
  };

  const getListingLimit = (tier: TierType): string => {
    const key = `${tier}_listing_limit` as keyof PlatformSettings;
    const limit = settings[key] as number | undefined;
    if (limit === -1) return "Sınırsız ilan";
    if (limit) return `${limit} ilan`;

    switch (tier) {
      case "free":
        return "10 ilan";
      case "basic":
        return `${settings.basic_listing_limit ?? 50} ilan`;
      case "premium":
        return "Sınırsız ilan";
      case "business":
        return "Sınırsız ilan";
      default:
        return "10 ilan";
    }
  };

  const getFeatures = (tier: TierType): string[] => {
    const base = [...TIER_FEATURES[tier]];
    if (tier !== "free") {
      base[0] = getListingLimit(tier);
    }
    return base;
  };

  const tierIndex = (tier: TierType) => TIER_ORDER.indexOf(tier);

  const handleTierAction = (tier: TierType) => {
    if (tier === "free" || tier === currentTier) return;
    if (tierIndex(tier) < tierIndex(currentTier)) {
      appAlert(
        "Alt plana geçiş",
        "Mevcut üyelik döneminiz sürerken daha düşük bir plana geçemezsiniz. Üyeliğinizi iptal edip dönem sonunda ücretsiz plana düştükten sonra istediğiniz plana geçebilirsiniz.",
      );
      return;
    }
    router.push(`/membership/checkout?tier=${tier}&period=${billingPeriod}`);
  };

  const hasPendingPayment = !!membership?.pendingPayment;

  return {
    t,
    loading,
    error,
    membership,
    settings,
    billingPeriod,
    setBillingPeriod,
    fetchData,
    currentTier,
    visibleTiers,
    guardLocked,
    handleBack,
    handleLockedExit,
    getPrice,
    getFeatures,
    tierIndex,
    handleTierAction,
    hasPendingPayment,
  };
}

export type MembershipController = ReturnType<typeof useMembership>;
