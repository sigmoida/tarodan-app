"use client";

import { adminApi } from "@/lib/api";
import { ExportButton } from "@/components/list/ExportButton";

/**
 * Filtrenin tamamını Excel olarak indirir. Sunucu her indirmeyi denetim
 * kaydına yazar.
 */
export function ConsentsExportButton() {
  return (
    <ExportButton
      fetcher={(params) => adminApi.exportConsents(params)}
      fallbackFilename="onay-kayitlari.xlsx"
    />
  );
}
