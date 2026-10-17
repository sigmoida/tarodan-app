"use client";

import { adminApi } from "@/lib/api";
import { ExportButton } from "@/components/list/ExportButton";

/**
 * Filtrenin tamamını Excel olarak indirir. Dosya TAM kimlik numaralarını
 * taşır; sunucu her indirmeyi denetim kaydına yazar.
 */
export function GibReportExportButton() {
  return (
    <ExportButton
      fetcher={(params) => adminApi.exportGibReport(params)}
      fallbackFilename="gib-ilan-satici-raporu.xlsx"
    />
  );
}
