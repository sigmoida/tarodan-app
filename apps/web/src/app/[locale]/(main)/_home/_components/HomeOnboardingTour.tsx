"use client";

import { useEffect, useMemo, useState } from "react";
import type { Step } from "react-joyride";
import { useTranslations } from "next-intl";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

export default function HomeOnboardingTour({
  hasProducts,
}: {
  hasProducts: boolean;
}) {
  const t = useTranslations();
  const [showDesktopSearchStep, setShowDesktopSearchStep] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const syncViewport = () => setShowDesktopSearchStep(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const steps = useMemo<Step[]>(() => {
    const tourSteps: Step[] = [
      {
        target: "body",
        placement: "center",
        title: t("onboarding.welcomeTitle"),
        content: t("onboarding.welcomeContent"),
      },
    ];

    if (showDesktopSearchStep) {
      tourSteps.push({
        target: '[data-tour="search"]',
        placement: "bottom",
        // Sticky başlık içindeki hedefler: `isFixed` olmadan spotlight belge
        // koordinatlarına göre hesaplanıyor ve sayfa kaydıkça hedefin altına
        // kayıyordu (kart aşağıda "yakalanıyor" gibi görünmesinin sebebi buydu).
        isFixed: true,
        title: t("onboarding.searchTitle"),
        content: t("onboarding.searchContent"),
      });
    }

    if (hasProducts) {
      tourSteps.push({
        target: '[data-tour="home-product"]',
        // Ürün kartı grid'in solunda; sabit "right" yerleşimi dar ekranda kartı
        // ekran dışına taşıyordu. "auto" en uygun tarafı kendisi seçer.
        placement: "auto",
        title: t("onboarding.productTitle"),
        content: t("onboarding.productContent"),
      });
    }

    tourSteps.push(
      {
        target: '[data-tour="cart"]',
        placement: "bottom-end",
        isFixed: true,
        title: t("onboarding.cartTitle"),
        content: t("onboarding.cartContent"),
      },
      {
        target: '[data-tour="new-listing"]',
        placement: "bottom-end",
        isFixed: true,
        title: t("onboarding.sellTitle"),
        content: t("onboarding.sellContent"),
      },
      {
        target: '[data-tour="account"]',
        placement: "bottom-end",
        isFixed: true,
        title: t("onboarding.accountTitle"),
        content: t("onboarding.accountContent"),
      },
    );

    return tourSteps;
  }, [hasProducts, showDesktopSearchStep, t]);

  return <OnboardingTour tour="home" steps={steps} />;
}
