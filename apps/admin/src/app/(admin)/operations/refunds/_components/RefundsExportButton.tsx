"use client";

import { adminApi } from "@/lib/api";
import { ExportButton } from "@/components/list/ExportButton";
import { useRefundTabs } from "../_hooks/useRefundTabs";

/**
 * Geçerli sekme + alt sekme + filtrenin tamamını Excel olarak indirir; dosyayı
 * API listeyle AYNI kaynaktan üretir (uzun biçim).
 */
export function RefundsExportButton() {
  const { tab, bucket } = useRefundTabs();
  return (
    <ExportButton
      fetcher={(params) => adminApi.exportRefundRequests(params)}
      params={{ tab, bucket }}
      fallbackFilename="iadeler.xlsx"
    />
  );
}
