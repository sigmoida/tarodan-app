"use client";

import { useTranslations } from "next-intl";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { WHY_2FA_MATTERS_KEYS } from "../_lib/types";

export default function WhyItMatters() {
  const t = useTranslations();
  return (
    <div className="mt-8 rounded-xl bg-surface-alt p-6">
      <h3 className="mb-3 font-medium text-heading">
        {t("profile.twoFactor.whyTitle")}
      </h3>
      <ul className="space-y-2 text-sm text-muted">
        {WHY_2FA_MATTERS_KEYS.map((key) => (
          <li key={key} className="flex items-start">
            <CheckCircleIcon className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-success-500" />
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
