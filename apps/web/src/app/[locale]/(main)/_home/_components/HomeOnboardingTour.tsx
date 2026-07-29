"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step,
} from "react-joyride";
import { useTranslations } from "next-intl";
import { userApi } from "@/lib/api";
import {
  HOME_TOUR_VERSION,
  shouldStartHomeTour,
} from "@/lib/userExperiencePolicy.mjs";
import { useAuthStore } from "@/stores/authStore";

export default function HomeOnboardingTour({
  hasProducts,
}: {
  hasProducts: boolean;
}) {
  const t = useTranslations();
  const { isAuthenticated, isLoading, user, setUser } = useAuthStore();
  const [run, setRun] = useState(false);
  const [showDesktopSearchStep, setShowDesktopSearchStep] = useState(false);
  const completionPending = useRef(false);

  const eligible = shouldStartHomeTour({
    isAuthenticated,
    isLoading,
    completedVersion: user?.homeTourVersion,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const syncViewport = () => setShowDesktopSearchStep(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!eligible) {
      setRun(false);
      return;
    }
    const timer = window.setTimeout(() => setRun(true), 400);
    return () => window.clearTimeout(timer);
  }, [eligible]);

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
        title: t("onboarding.searchTitle"),
        content: t("onboarding.searchContent"),
      });
    }

    if (hasProducts) {
      tourSteps.push({
        target: '[data-tour="home-product"]',
        placement: "right",
        title: t("onboarding.productTitle"),
        content: t("onboarding.productContent"),
      });
    }

    tourSteps.push(
      {
        target: '[data-tour="cart"]',
        placement: "bottom-end",
        title: t("onboarding.cartTitle"),
        content: t("onboarding.cartContent"),
      },
      {
        target: '[data-tour="new-listing"]',
        placement: "bottom-end",
        title: t("onboarding.sellTitle"),
        content: t("onboarding.sellContent"),
      },
      {
        target: '[data-tour="account"]',
        placement: "bottom-end",
        title: t("onboarding.accountTitle"),
        content: t("onboarding.accountContent"),
      },
    );

    return tourSteps;
  }, [hasProducts, showDesktopSearchStep, t]);

  const completeTour = useCallback(async () => {
    if (completionPending.current) return;
    completionPending.current = true;
    try {
      await userApi.completeHomeTour(HOME_TOUR_VERSION);
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        setUser({
          ...currentUser,
          homeTourVersion: HOME_TOUR_VERSION,
        });
      }
    } catch {
      completionPending.current = false;
    }
  }, [setUser]);

  const handleEvent = useCallback(
    (event: EventData) => {
      if (
        event.type === EVENTS.TOUR_END &&
        (event.status === STATUS.FINISHED || event.status === STATUS.SKIPPED)
      ) {
        setRun(false);
        void completeTour();
      }
    },
    [completeTour],
  );

  return (
    <Joyride
      continuous
      run={run}
      steps={steps}
      onEvent={handleEvent}
      scrollToFirstStep
      locale={{
        back: t("onboarding.back"),
        nextWithProgress: t.raw("onboarding.next") as string,
        last: t("onboarding.finish"),
        skip: t("onboarding.skip"),
      }}
      options={{
        blockTargetInteraction: true,
        buttons: ["back", "primary", "skip"],
        closeButtonAction: "skip",
        dismissKeyAction: false,
        overlayClickAction: false,
        overlayColor: "rgba(17, 24, 39, 0.72)",
        primaryColor: "#ea580c",
        showProgress: true,
        skipBeacon: true,
        spotlightPadding: 8,
        spotlightRadius: 6,
        targetWaitTimeout: 1200,
        textColor: "#1f2937",
        width: 360,
        zIndex: 1200,
      }}
      styles={{
        tooltip: {
          borderRadius: 8,
          boxShadow: "0 18px 48px rgba(15, 23, 42, 0.2)",
        },
        buttonPrimary: {
          borderRadius: 6,
          fontWeight: 600,
        },
        buttonBack: {
          color: "#4b5563",
        },
        buttonSkip: {
          color: "#6b7280",
        },
      }}
    />
  );
}
