/** @format */

"use client";

import { useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { buildTiers, visibleTiers } from "./_lib/tiers";
import { useMembershipTiers } from "./_hooks/useMembershipTiers";
import { useMyMembership } from "./_hooks/useMyMembership";
import { useMembershipActions } from "./_hooks/useMembershipActions";
import { useTierSelection } from "./_hooks/useTierSelection";
import PlansSection from "./_sections/PlansSection";
import CurrentMembershipCard from "./_sections/CurrentMembershipCard";
import MembershipStatusBanners from "./_sections/MembershipStatusBanners";
import RequiredBusinessBanner from "./_sections/RequiredBusinessBanner";

/**
 * The interactive membership island. Public: anonymous visitors see the plans
 * and are sent to /login on "continue". Authenticated: also fetches
 * /membership/me and shows the current-membership management + status banners.
 */
export default function MembershipClient() {
  const t = useTranslations();
  const { isAuthenticated, user } = useAuthStore();
  const tierData = useMembershipTiers();
  const { prices } = tierData;
  const { membership } = useMyMembership(isAuthenticated);
  const actions = useMembershipActions();

  // Kurumsal iz: davet aktivasyonundan itibaren businessStatus dolu gelir.
  // Satın alma yetkisi ise API ile birebir aynı — YALNIZ nihai onaylı kurumsal
  // (approved + companyName + taxId) business alabilir. Eski `companyName &&
  // taxId` kontrolü taxId nihai onaya kadar boş kaldığından hem onaysızları
  // dışarıda bırakıyor hem de API'nin approved şartından ayrışıyordu.
  const isBusinessTrack = user?.businessStatus != null;
  const isBusinessAccount = !!(
    user &&
    user.businessStatus === "approved" &&
    user.companyName &&
    user.taxId
  );

  const {
    selectedPeriod,
    setSelectedPeriod,
    selectedTier,
    currentTier,
    isRequired,
    isExactCurrentPlan,
    handleSelectTier,
  } = useTierSelection({
    isAuthenticated,
    isBusinessAccount,
    membership,
    fallbackTier: user?.membershipTier ?? null,
    onDowngradeToFree: actions.cancelMembership,
  });

  const allTiers = useMemo(() => buildTiers(tierData, t), [tierData, t]);
  const tiers = useMemo(
    () =>
      visibleTiers(allTiers, { isAuthenticated, isBusinessTrack, currentTier }),
    [allTiers, isAuthenticated, isBusinessTrack, currentTier],
  );
  const showRequiredBanner =
    isRequired && isBusinessAccount && currentTier !== "business";
  const showCurrentCard =
    isAuthenticated && !!membership?.tier && membership.tier !== "free";

  return (
    <PageShell>
      <PageHeader
        title={t("membership.title")}
        description={t("membership.subtitle")}
      />

      {showRequiredBanner && <RequiredBusinessBanner />}

      {isAuthenticated && membership && (
        <MembershipStatusBanners
          membership={membership}
          currentTier={currentTier}
          onCancelScheduledChange={actions.cancelScheduledChange}
        />
      )}

      {showCurrentCard && membership && (
        <CurrentMembershipCard
          membership={membership}
          autoRenewSaving={actions.autoRenewSaving}
          cancelling={actions.cancelling}
          onToggleAutoRenew={actions.toggleAutoRenew}
          onCancel={actions.cancelMembership}
        />
      )}

      <PlansSection
        tiers={tiers}
        prices={prices}
        period={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        selectedTier={selectedTier}
        currentTier={currentTier}
        isAuthenticated={isAuthenticated}
        isExactCurrentPlan={isExactCurrentPlan}
        onSelect={handleSelectTier}
      />
    </PageShell>
  );
}
