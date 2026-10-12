"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import type { NetsisPingResult } from "@/lib/api/invoicing-settings.types";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  changedSettings,
  invoicingSettingsSchema,
  readInvoicingSettings,
  toFormValues,
  type InvoicingFormValues,
} from "./invoicing-settings";

export const INVOICING_SETTINGS_RESOURCE = "invoicing-settings";

async function fetchInvoicingSettings() {
  const response = await adminApi.getInvoicingSettings();
  return readInvoicingSettings(response.data);
}

/**
 * Faturalama Ayarları sayfasının durumu. Tek form bütün ayarları taşır; Kaydet
 * yalnız DEĞİŞENleri tek istekte gönderir (sunucu hepsini tek işlemde yazar ve
 * önce/sonra denetim kaydı bırakır). Bağlantı testi ayrı bir mutasyondur;
 * sonucu (başarı ya da sunucunun yerelleştirilmiş hata metni) sayfada kalır.
 */
export function useInvoicingSettingsPage() {
  const t = useTranslations();
  const [pingResult, setPingResult] = useState<NetsisPingResult | null>(null);

  const query = useQuery({
    queryKey: adminKeys.all(INVOICING_SETTINGS_RESOURCE),
    queryFn: fetchInvoicingSettings,
  });
  const state = query.data ?? null;
  const rows = state?.settings ?? [];

  const form = useZodForm(invoicingSettingsSchema(t, rows), {
    values: state ? toFormValues(state.settings) : undefined,
  });

  const save = useAdminMutation(
    (values: Record<string, string | boolean>) =>
      adminApi.updateInvoicingSettings({ values }),
    {
      invalidates: [INVOICING_SETTINGS_RESOURCE],
      successMessage: t("admin.invoicingSettings.saved"),
    },
  );

  const ping = useAdminMutation(
    async () => {
      const response = await adminApi.pingNetsis();
      return response.data as NetsisPingResult;
    },
    { onSuccess: setPingResult },
  );

  const submit = (values: InvoicingFormValues) => {
    const changed = changedSettings(values, rows);
    if (Object.keys(changed).length > 0) save.mutate(changed);
  };

  return { t, query, state, form, save, submit, ping, pingResult };
}
