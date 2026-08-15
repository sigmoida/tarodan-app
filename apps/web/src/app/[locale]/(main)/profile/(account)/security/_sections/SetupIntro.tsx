"use client";

import { useTranslations } from "next-intl";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { REQUIREMENT_KEYS } from "../_lib/types";

export default function SetupIntro({
  onStart,
  isLoading,
}: {
  onStart: () => void;
  isLoading: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-medium text-heading">
        {t("profile.twoFactor.enable")}
      </h3>
      <p className="mb-6 text-muted">{t("profile.twoFactor.intro")}</p>

      <div className="mb-6 rounded-lg border border-border bg-surface-alt p-4">
        <h4 className="mb-2 font-medium text-primary-900">
          {t("profile.twoFactor.requirementsTitle")}
        </h4>
        <ul className="space-y-1 text-sm text-primary-800">
          {REQUIREMENT_KEYS.map((key) => (
            <li key={key} className="flex items-center">
              <CheckCircleIcon className="mr-2 h-4 w-4 flex-shrink-0" />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onStart}
        disabled={isLoading}
      >
        {isLoading ? t("common.loading") : t("profile.twoFactor.startSetup")}
      </Button>
    </div>
  );
}
