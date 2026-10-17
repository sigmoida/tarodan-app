"use client";

import { useTranslations } from "next-intl";
import { Toggle } from "@tarodan/ui";
import { DISTANCE_SALES_CONSENT_REQUIRED_SETTING } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { readDistanceSalesConsentRequired } from "@/lib/settings";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { SectionCard } from "@/components/detail/SectionCard";

/**
 * Mesafeli satış onayının ödeme adımında zorunluluğu. Varsayılan KAPALI:
 * onay kutusunu göndermeyen eski mobil sürümler ödeme yapabilsin. Mobilin
 * onayı gönderen sürümü yayılınca açılır; API ayarı her ödeme formunda okur,
 * deploy gerekmez.
 */
export function LegalSettingsCard() {
  const t = useTranslations();
  const { data: required = false, isLoading } = usePlatformSettings(
    readDistanceSalesConsentRequired,
  );

  const save = useAdminMutation(
    (next: boolean) =>
      adminApi.updateSetting(
        DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
        next ? "true" : "false",
      ),
    {
      invalidates: ["platform-settings"],
      successMessage: t("admin.settings.saved"),
    },
  );

  return (
    <SectionCard title={t("admin.settings.legal.title")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-heading">
            {t("admin.settings.legal.distanceSalesRequired.label")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t("admin.settings.legal.distanceSalesRequired.helper")}
          </p>
        </div>
        <Toggle
          checked={required}
          onChange={(next) => save.mutate(next)}
          disabled={isLoading || save.isPending}
          label={t("admin.settings.legal.distanceSalesRequired.label")}
        />
      </div>
    </SectionCard>
  );
}
