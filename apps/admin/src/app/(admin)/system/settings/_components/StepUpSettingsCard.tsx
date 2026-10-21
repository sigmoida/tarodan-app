"use client";

import { useTranslations } from "next-intl";
import { REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING } from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import { SettingToggle } from "./SettingToggle";

/**
 * Whether account deletion and the e-mail change request need a step-up
 * confirmation even when the client sends none. Off by default: mobile 1.0.5
 * and older send none. Switch it on only after the minimum supported app
 * version is above 1.0.5 (tarodan-ops `compat.md`).
 */
export function StepUpSettingsCard() {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.settings.security.reauth.title")}>
      <SettingToggle
        settingKey={REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING}
        label={t("admin.settings.security.reauth.label")}
        helper={t("admin.settings.security.reauth.helper")}
      />
    </SectionCard>
  );
}
