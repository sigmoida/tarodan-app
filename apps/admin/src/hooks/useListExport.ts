"use client";

import { useContext, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import type { AxiosResponse } from "axios";
import { downloadBlob } from "@/lib/download";
import { ResourceListContext } from "@/context/ResourceListContext";
import { listFilterParams } from "@/hooks/useAdminResource";
import {
  EXPORT_XLSX_MIME,
  exportErrorMessage,
  exportNotice,
  exportSortParams,
  readExportResponse,
} from "@/lib/serverExport";

type ExportParams = Record<string, unknown>;

export interface ListExportOptions {
  /** Sunucunun Excel ucu (`responseType: "blob"`); birleşik parametrelerle çağrılır. */
  fetcher: (params: ExportParams) => Promise<AxiosResponse>;
  /** Listenin üstüne eklenen ek parametreler (sekme, dönem …). */
  params?: ExportParams;
  /** Sunucu `Content-Disposition` göndermezse kullanılan dosya adı. */
  fallbackFilename?: string;
  /**
   * Listenin filtre + arama + sıralaması dökümle gider (varsayılan). Liste
   * bağlamı olmayan ya da dökümü kendi parametreleriyle (dönem, sekme) süren
   * yerlerde `false`.
   */
  listState?: boolean;
}

const FALLBACK_FILENAME = "export.xlsx";

/**
 * Tek döküm akışı: sunucu, ekrandaki listenin TAMAMINI (aynı filtre, arama,
 * sıralama) Excel olarak üretir; burada yalnız indirilir ve bildirilir. Dosya
 * adı `Content-Disposition`dan gelir, tavan aşıldıysa kullanıcı uyarılır,
 * hata sunucunun mesajıyla gösterilir. İstemci tarafı dosya üretimi YOKTUR.
 *
 * `download(override)` aynı akışı çağrı başına farklı uçla çalıştırır (satır
 * menüsündeki "kodları indir" gibi).
 */
export function useListExport(options?: Partial<ListExportOptions>): {
  download: (override?: Partial<ListExportOptions>) => Promise<void>;
  isExporting: boolean;
} {
  const t = useTranslations();
  const list = useContext(ResourceListContext);
  const [isExporting, setExporting] = useState(false);

  const download = async (override?: Partial<ListExportOptions>) => {
    const { fetcher, params, fallbackFilename, listState } = {
      listState: true,
      ...options,
      ...override,
    };
    if (!fetcher) return;
    const listParams =
      listState && list
        ? {
            ...listFilterParams(list.search, list.filters),
            ...exportSortParams(list.sort),
          }
        : {};

    setExporting(true);
    try {
      const response = await fetcher({ ...listParams, ...params });
      const file = readExportResponse(
        response,
        fallbackFilename ?? FALLBACK_FILENAME,
      );
      downloadBlob(file.filename, file.data, EXPORT_XLSX_MIME);
      const notice = exportNotice(file);
      if (notice.kind === "truncated") {
        toast(t("admin.shared.export.truncated", { count: notice.count }));
      } else if (notice.count != null) {
        toast.success(
          t("admin.shared.export.success", { count: notice.count }),
        );
      } else {
        toast.success(t("admin.shared.export.successNoCount"));
      }
    } catch (error) {
      toast.error(
        await exportErrorMessage(error, t("admin.shared.export.failed")),
      );
    } finally {
      setExporting(false);
    }
  };

  return { download, isExporting };
}
