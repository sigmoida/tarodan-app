"use client";

import { useTranslations } from "next-intl";
import { REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING } from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import { SettingToggle } from "./SettingToggle";

/**
 * Whether account deletion and the e-mail change request need a step-up
 * confirmation even when the client sends none. Off by default: no mobile
 * version sends one yet (not 1.0.5, 1.1.0 or 1.1.1), nor web until its
 * step-up release. Switch it on only after that web release is live and the
 * minimum supported app version (iOS and Android) is at least the first
 * mobile version that sends it (tarodan-ops `compat.md`).
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
