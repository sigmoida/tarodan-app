"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useListExport } from "@/hooks/useListExport";

/** Onay Kayıtları dökümü — akış `useListExport`ta, burada yalnız uç ve metinler. */
export function useConsentExport(): {
  download: () => Promise<void>;
  isExporting: boolean;
} {
  const t = useTranslations();
  return useListExport({
    request: (params) => adminApi.exportConsents(params),
    fallbackFilename: "onay-kayitlari.xlsx",
    messages: {
      success: t("admin.consents.exported"),
      failed: t("admin.consents.exportFailed"),
      truncated: (count) => t("admin.consents.exportTruncated", { count }),
    },
  });
}
