"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useResourceList } from "@/components/list";
import { listFilterParams } from "@/hooks/useAdminResource";
import { exportFilename, exportParams, isTruncated } from "../_lib/export";
import { useCancellationTabs } from "./useCancellationTabs";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Geçerli sekme + alt sekme + filtre + sıralamanın Excel dosyası. Dosyayı API
 * listeyle AYNI kaynaktan üretir; tavan aşıldıysa kullanıcı uyarılır.
 */
export function useCancellationExport(): {
  download: () => Promise<void>;
  isExporting: boolean;
} {
  const t = useTranslations();
  const { tab, bucket } = useCancellationTabs();
  const { search, filters, sort } = useResourceList();
  const [isExporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const response = await adminApi.exportCancellations(
        exportParams({
          tab,
          bucket,
          filters: listFilterParams(search, filters),
          sort,
        }),
      );
      downloadBlob(
        exportFilename(response.headers),
        response.data as BlobPart,
        XLSX_TYPE,
      );
      const truncated = isTruncated(response.headers);
      if (truncated) {
        toast(
          t("admin.operations.cancellations.export.truncated", {
            count: truncated,
          }),
        );
      }
    } finally {
      setExporting(false);
    }
  };

  return { download, isExporting };
}
