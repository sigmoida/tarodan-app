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
  isSettingsTab,
  parseSettings,
  settingPayloadValue,
  settingsSchema,
  settingsTabs,
  tabFields,
  tabTitle,
  toFormValues,
} from "./settings";

export function useSettingsPage() {
  const t = useTranslations();
  const [rawTab, setTab] = useTabParam("listing");
  // "warehouse" and "legal" render their own cards; any other value that is
  // not a numeric-form tab (e.g. an old `?tab=trade` link — trade durations
  // moved to Durations & Rules) falls back to the first tab, so
  // `fieldsByTab`/`tabTitle` indexing stays safe.
  const isWarehouseTab = rawTab === "warehouse";
  const isLegalTab = rawTab === "legal";
  const activeTab: SettingsTab = isSettingsTab(rawTab) ? rawTab : "listing";
  const tab = isWarehouseTab || isLegalTab ? rawTab : activeTab;
  const fieldsByTab = tabFields(t);

  // Ham yanıt cache'lenir, dönüşüm `select`te — PSP oranı ve yasal ayarlar
  // aynı sorguyu paylaşır (bkz. usePlatformSettings).
  const query = usePlatformSettings(parseSettings);

  // Reactively reseed from the query (including after invalidation) without an
  // effect-backed state mirror. All tabs remain valid on whole-form submit.
  // A reseed keeps fields the admin is still editing: an on/off toggle on the
  // same tab saves on its own and invalidates the same query.
  const form = useZodForm(settingsSchema(t), {
    values: query.data ? toFormValues(query.data) : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const save = useAdminMutation(
    (payload: { tab: SettingsTab; values: SettingsFormValues }) =>
      Promise.all(
        fieldsByTab[payload.tab].map((field) =>
          adminApi.updateSetting(
            field.backendKey,
            settingPayloadValue(field, payload.values[field.key]),
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
    isSecurityTab: activeTab === "security",
    tabs: settingsTabs(t),
    title: tabTitle(t)[activeTab],
    fields: fieldsByTab[activeTab],
    query,
    form,
    save,
  };
}
