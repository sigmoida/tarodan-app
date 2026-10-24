"use client";

import { useTranslations } from "next-intl";
import { DISTANCE_SALES_CONSENT_REQUIRED_SETTING } from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import { SettingToggle } from "./SettingToggle";

/**
 * Whether the distance sales consent is required at payment. Off by default,
 * so older mobile builds that do not send the checkbox can still pay; switch
 * it on once the mobile build that sends it has rolled out.
 */
export function LegalSettingsCard() {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.settings.legal.title")}>
      <SettingToggle
        settingKey={DISTANCE_SALES_CONSENT_REQUIRED_SETTING}
        label={t("admin.settings.legal.distanceSalesRequired.label")}
        helper={t("admin.settings.legal.distanceSalesRequired.helper")}
      />
    </SectionCard>
  );
}
