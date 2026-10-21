"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

/** Pause, resume and extend of one boost (no money moves). */
export function useBoostLifecycle(id: string) {
  const t = useTranslations();
  const options = (successMessage: string) => ({
    invalidates: ["boost-purchases"],
    successMessage,
  });

  const pause = useAdminMutation(
    () => adminApi.pauseBoostPurchase(id).then((response) => response.data),
    options(t("admin.marketing.boostPurchases.paused")),
  );
  const resume = useAdminMutation(
    () => adminApi.resumeBoostPurchase(id).then((response) => response.data),
    options(t("admin.marketing.boostPurchases.resumed")),
  );
  const extend = useAdminMutation(
    (days: number) =>
      adminApi.extendBoostPurchase(id, days).then((response) => response.data),
    options(t("admin.marketing.boostPurchases.extended")),
  );

  return { pause, resume, extend };
}
