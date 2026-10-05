"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
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

interface ListExportOptions {
  /** Sunucunun Excel ucu — liste filtresi + sıralama parametreleriyle çağrılır. */
  request: (params: Record<string, string>) => Promise<AxiosResponse>;
  /** Sunucu `Content-Disposition` göndermezse kullanılan dosya adı. */
  fallbackFilename: string;
  /** Çevrilmiş toast metinleri (çağıran `t` ile çözer). */
  messages: {
    success: string;
    failed: string;
    truncated: (count: number) => string;
  };
}

/**
 * Sunucu tarafı Excel dökümü: geçerli filtre + arama + sıralamanın TAMAMI
 * (yalnız ekrandaki sayfa değil). Sunucu dökümü listeyle aynı sorgudan üretir
 * ve indirmeyi denetim kaydına yazar; tavan aşıldıysa kullanıcı uyarılır.
 * Onay Kayıtları ve GİB raporu aynı akışı paylaşır.
 */
export function useListExport({
  request,
  fallbackFilename,
  messages,
}: ListExportOptions): {
  download: () => Promise<void>;
  isExporting: boolean;
} {
  const { search, filters, sort } = useResourceList();
  const [isExporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const response = await request({
        ...listFilterParams(search, filters),
        ...exportSortParams(sort),
      });
      downloadBlob(
        exportFilename(response.headers, fallbackFilename),
        response.data as BlobPart,
        XLSX_TYPE,
      );
      const truncated = exportTruncatedAt(response.headers);
      if (truncated) {
        toast(messages.truncated(truncated));
      } else {
        toast.success(messages.success);
      }
    } catch {
      toast.error(messages.failed);
    } finally {
      setExporting(false);
    }
  };

  return { download, isExporting };
}
