"use client";

import { adminApi } from "@/lib/api";
import { ExportButton } from "@/components/list/ExportButton";
import { useCancellationTabs } from "../_hooks/useCancellationTabs";

/**
 * Geçerli sekme + alt sekme + filtrenin tamamını Excel olarak indirir; dosyayı
 * API listeyle AYNI kaynaktan üretir.
 */
export function CancellationExportButton() {
  const { tab, bucket } = useCancellationTabs();
  return (
    <ExportButton
      fetcher={(params) => adminApi.exportCancellations(params)}
      params={{ tab, bucket }}
      fallbackFilename="iptaller.xlsx"
    />
  );
}
