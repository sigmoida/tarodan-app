"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
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
  // "warehouse" has its own card/form; the numeric form falls back to a valid
  // tab so `fieldsByTab`/`tabTitle` indexing stays safe while it's hidden.
  const isWarehouseTab = tab === "warehouse";
  const activeTab = (isWarehouseTab ? "listing" : tab) as SettingsTab;
  const fieldsByTab = tabFields(t);

  // Ham yanıt cache'lenir, dönüşüm `select`te: `usePspFeeRate` AYNI anahtarı
  // paylaşır — queryFn'ler farklı şekil döndürseydi cache'i kim önce doldurursa
  // diğeri yanlış şekli okurdu (form ham diziyle seed'lenir ya da oran hep
  // varsayılana düşerdi).
  const query = useQuery({
    queryKey: adminKeys.all("platform-settings"),
    queryFn: async () => {
      const response = await adminApi.getSettings();
      return response.data?.data ?? response.data ?? [];
    },
    select: parseSettings,
  });

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
    tabs: settingsTabs(t),
    title: tabTitle(t)[activeTab],
    fields: fieldsByTab[activeTab],
    query,
    form,
    save,
  };
}
