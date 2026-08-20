/** @format */

"use client";

import { ClockIcon } from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";
import { useTranslations } from "next-intl";

export default function TradeCountdown({
  countdown,
}: {
  countdown: string | null;
}) {
  const t = useTranslations();
  if (!countdown) return null;
  return (
    <Alert
      variant="warning"
      icon={<ClockIcon className="h-6 w-6 text-warning-600" />}
      title={t("page.trades.tradecountdown.kalanSure")}
      className="mb-6"
    >
      <p className="font-mono text-lg font-bold text-warning-800">
        {countdown}
      </p>
      <p className="text-warning-700">
        {t("page.trades.tradecountdown.lutfenSureDolmadanIsleminiziTamamlayin")}
      </p>
    </Alert>
  );
}
