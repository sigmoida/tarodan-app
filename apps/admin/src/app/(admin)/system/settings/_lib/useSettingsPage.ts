"use client";

import { useTranslations } from "next-intl";
import { useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useTabParam } from "@/hooks/useTabParam";
import {
  type SettingsFormValues,
  type SettingsTab,
  parseSettings,
  settingsSchema,
  settingsTabs,
  tabFields,
  tabTitle,
  toFormValues,
} from "./settings";

export function useSettingsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("listing");
  // "warehouse" and "legal" render their own cards; the numeric form falls
  // back to a valid tab so `fieldsByTab`/`tabTitle` indexing stays safe while
  // it's hidden.
  const isWarehouseTab = tab === "warehouse";
  const isLegalTab = tab === "legal";
  const activeTab = (
    isWarehouseTab || isLegalTab ? "listing" : tab
  ) as SettingsTab;
  const fieldsByTab = tabFields(t);

  // Ham yanıt cache'lenir, dönüşüm `select`te — PSP oranı ve yasal ayarlar
  // aynı sorguyu paylaşır (bkz. usePlatformSettings).
  const query = usePlatformSettings(parseSettings);

  // Reactively reseed from the query (including after invalidation) without an
  // effect-backed state mirror. All tabs remain valid on whole-form submit.
  const form = useZodForm(settingsSchema(t), {
    values: query.data ? toFormValues(query.data) : undefined,
  });

  const save = useAdminMutation(
    (payload: { tab: SettingsTab; values: SettingsFormValues }) =>
      Promise.all(
        fieldsByTab[payload.tab].map((field) =>
          adminApi.updateSetting(
            field.backendKey,
            String(Number(payload.values[field.key])),
          ),
        ),
      ),
    {
      invalidates: ["platform-settings"],
      successMessage: t("admin.settings.saved"),
    },
  );

  return {
    t,
    tab,
    setTab,
    activeTab,
    isWarehouseTab,
    isLegalTab,
    tabs: settingsTabs(t),
    title: tabTitle(t)[activeTab],
    fields: fieldsByTab[activeTab],
    query,
    form,
    save,
  };
}
