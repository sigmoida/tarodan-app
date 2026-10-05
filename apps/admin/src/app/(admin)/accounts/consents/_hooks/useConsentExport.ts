"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useResourceList } from "@/components/list";
import { listFilterParams } from "@/hooks/useAdminResource";
import {
  exportFilename,
  exportSortParams,
  exportTruncatedAt,
} from "@/lib/serverExport";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Geçerli filtre + arama + sıralamanın Excel dökümü (yalnız ekrandaki sayfa
 * değil). Sunucu dökümü listeyle aynı sorgudan üretir, indirmeyi denetim
 * kaydına yazar; tavan aşıldıysa kullanıcı uyarılır.
 */
export function useConsentExport(): {
  download: () => Promise<void>;
  isExporting: boolean;
} {
  const t = useTranslations();
  const { search, filters, sort } = useResourceList();
  const [isExporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const response = await adminApi.exportConsents({
        ...listFilterParams(search, filters),
        ...exportSortParams(sort),
      });
      downloadBlob(
        exportFilename(response.headers, "onay-kayitlari.xlsx"),
        response.data as BlobPart,
        XLSX_TYPE,
      );
      const truncated = exportTruncatedAt(response.headers);
      if (truncated) {
        toast(t("admin.consents.exportTruncated", { count: truncated }));
      } else {
        toast.success(t("admin.consents.exported"));
      }
    } catch {
      toast.error(t("admin.consents.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return { download, isExporting };
}
