/** @format */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  ONBOARDING_TOURS,
  shouldStartTour,
  type OnboardingTourKey,
} from "@/lib/userExperiencePolicy.mjs";
import { useAuthStore } from "@/stores/authStore";
import { tourOptions, tourStyles } from "./tourTheme";

/**
 * Tanıtım turlarının ortak gövdesi: uygunluk kontrolü, Joyride yapılandırması,
 * tamamlama çağrısı ve store güncellemesi. Her tur yalnız kendi adımlarını verir —
 * ana sayfa ve ilan verme turlarının aynı görünüp aynı davranmasının tek yolu.
 */
export default function OnboardingTour({
  tour,
  steps,
  /** Adımların hedefleri hazır mı (sayfa verisi yüklendi mi)? */
  ready = true,
}: {
  tour: OnboardingTourKey;
  steps: Step[];
  ready?: boolean;
}) {
  const t = useTranslations();
  const { isAuthenticated, isLoading, user, setUser } = useAuthStore();
  const [run, setRun] = useState(false);
  const completionPending = useRef(false);
  const config = ONBOARDING_TOURS[tour];

  const eligible =
    ready &&
    steps.length > 0 &&
    shouldStartTour({
      isAuthenticated,
      isLoading,
      completedVersion: user?.[config.field as keyof typeof user] as
        number | undefined,
      tour,
    });

  useEffect(() => {
    if (!eligible) {
      setRun(false);
      return;
    }
    // Kısa gecikme: hedefler (sticky başlık, lazy görseller) yerine otursun,
    // yoksa spotlight henüz kaymamış bir konumu çerçeveliyor.
    const timer = window.setTimeout(() => setRun(true), 450);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  const completeTour = useCallback(async () => {
    if (completionPending.current) return;
    completionPending.current = true;
    try {
      await userApi.completeTour(tour, config.version);
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        setUser({ ...currentUser, [config.field]: config.version });
      }
    } catch {
      // Sunucuya yazılamadıysa turu tamamlanmış saymayalım: bir sonraki
      // girişte tekrar denenir (aksi halde tur sessizce kaybolurdu).
      completionPending.current = false;
    }
  }, [config.field, config.version, setUser, tour]);

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
      options={tourOptions()}
      styles={tourStyles()}
    />
  );
}
