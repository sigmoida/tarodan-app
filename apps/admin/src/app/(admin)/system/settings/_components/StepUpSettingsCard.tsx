"use client";

import { useTranslations } from "next-intl";
import { REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING } from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import { SettingToggle } from "./SettingToggle";

/**
 * Whether account deletion and the e-mail change request need a step-up
 * confirmation even when the client sends none. Off by default; when to
 * switch it on is documented on
 * `REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING` (`@tarodan/types`).
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
