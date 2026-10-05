"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useListExport } from "@/hooks/useListExport";

/** GİB raporu dökümü — akış `useListExport`ta, burada yalnız uç ve metinler. */
export function useGibReportExport(): {
  download: () => Promise<void>;
  isExporting: boolean;
} {
  const t = useTranslations();
  return useListExport({
    request: (params) => adminApi.exportGibReport(params),
    fallbackFilename: "gib-ilan-satici-raporu.xlsx",
    messages: {
      success: t("admin.gibReport.exported"),
      failed: t("admin.gibReport.exportFailed"),
      truncated: (count) => t("admin.gibReport.exportTruncated", { count }),
    },
  });
}
