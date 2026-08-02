/** @format */

"use client";

import { useMemo } from "react";
import type { Step } from "react-joyride";
import { useTranslations } from "next-intl";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

/**
 * İlan verme formunun tanıtım turu — ana sayfa turuyla aynı bileşeni ve temayı
 * kullanır, yalnız adımları kendine aittir.
 *
 * Hedefler uzun bir formda dikey olarak dizili, yani her adım sayfayı kaydırıyor;
 * `placement: "top"` yerine "auto" bırakmak kartın ekran dışına taşmasını önler ve
 * ortak `scrollOffset` sticky başlığın altına gizlenmesini engeller.
 */
export default function NewListingTour({ ready }: { ready: boolean }) {
  const t = useTranslations();

  const steps = useMemo<Step[]>(
    () => [
      {
        target: "body",
        placement: "center",
        title: t("onboarding.listing.welcomeTitle"),
        content: t("onboarding.listing.welcomeContent"),
      },
      {
        target: '[data-tour="listing-basics"]',
        placement: "auto",
        title: t("onboarding.listing.basicsTitle"),
        content: t("onboarding.listing.basicsContent"),
      },
      {
        target: '[data-tour="listing-details"]',
        placement: "auto",
        title: t("onboarding.listing.detailsTitle"),
        content: t("onboarding.listing.detailsContent"),
      },
      {
        target: '[data-tour="listing-pricing"]',
        placement: "auto",
        title: t("onboarding.listing.pricingTitle"),
        content: t("onboarding.listing.pricingContent"),
      },
      {
        target: '[data-tour="listing-images"]',
        placement: "auto",
        title: t("onboarding.listing.imagesTitle"),
        content: t("onboarding.listing.imagesContent"),
      },
      {
        target: '[data-tour="listing-submit"]',
        placement: "top",
        title: t("onboarding.listing.submitTitle"),
        content: t("onboarding.listing.submitContent"),
      },
    ],
    [t],
  );

  return <OnboardingTour tour="listing" steps={steps} ready={ready} />;
}
