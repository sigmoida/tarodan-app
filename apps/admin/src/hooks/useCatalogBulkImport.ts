"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import type {
  CatalogImportResource,
  CatalogImportResult,
  CatalogImportSchema,
} from "@/lib/api/catalog-import.types";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { downloadBlob } from "@/lib/download";
import { extractErrorMessage, extractImportErrors } from "@/lib/error";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Şema gelene kadar kullanılan yedek limitler. Sunucu tek kaynak; bunlar
 * yalnızca dialog açılırken ilk sorgu dönmeden dosya seçilirse devreye girer.
 */
const FALLBACK_LIMITS = { maxRows: 200, maxFileBytes: 2 * 1024 * 1024 };

/**
 * İçe aktarma sonrası tazelenecek kaynaklar. Araç modeli eklenince marka
 * satırındaki model sayısı da değişir — iki listeyi birden tazeleriz.
 */
const INVALIDATES: Record<CatalogImportResource, string[]> = {
  brands: ["brands"],
  manufacturers: ["manufacturers"],
  "car-models": ["car-models", "brands"],
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Marka / üretici / araç modeli ekranlarının ortak toplu içe aktarma mantığı.
 * Üç ekran da aynı hook'u yalnızca `resource` farkıyla kullanır.
 */
export function useCatalogBulkImport(
  resource: CatalogImportResource,
  open: boolean,
  onClose: () => void,
) {
  const t = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<CatalogImportResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const schemaQuery = useQuery<CatalogImportSchema>({
    queryKey: adminKeys.options(`${resource}-import`),
    queryFn: async () => (await adminApi.getCatalogImportSchema(resource)).data,
    enabled: open,
    // Kolon tanımı dağıtımla değişir, oturum içinde değil.
    staleTime: Infinity,
  });
  const limits = schemaQuery.data?.limits ?? FALLBACK_LIMITS;

  const upload = useAdminMutation(
    async () => {
      try {
        return (await adminApi.bulkImportCatalog(resource, file!)).data;
      } catch (error) {
        // Hata listesi burada çıkarılır: `useAdminMutation` kendi `onError`'ını
        // uyguladığı için `mutation.onError` iletilmiyor.
        setErrors(extractImportErrors(error, t("admin.catalog.import.failed")));
        throw error;
      }
    },
    {
      invalidates: INVALIDATES[resource],
      // Dialog başarıyı kendi içinde gösteriyor; toast ikinci bir bildirim olurdu.
      showErrorToast: false,
      onSuccess: (data) => {
        setErrors([]);
        setResult(data);
      },
      mutation: {
        onMutate: () => {
          setErrors([]);
          setResult(null);
        },
      },
    },
  );

  const selectFile = (next: File | null) => {
    setFile(next);
    // Yeni dosya seçildiğinde önceki turun hataları ekranda kalmasın.
    setErrors([]);
    setResult(null);
  };

  const rejectFile = (rejected: File, reason: "type" | "size") => {
    setFile(null);
    setResult(null);
    setErrors([
      reason === "size"
        ? t("admin.catalog.import.fileTooLarge", {
            name: rejected.name,
            size: formatFileSize(limits.maxFileBytes),
          })
        : t("admin.catalog.import.invalidFileType", { name: rejected.name }),
    ]);
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const response = await adminApi.downloadCatalogImportTemplate(resource);
      downloadBlob(
        `tarodan-${resource}-sablonu.xlsx`,
        response.data as BlobPart,
        XLSX_MIME,
      );
    } catch (error) {
      // Hata inline gösterilir: bozuk bir dosyanın sessizce inmesinden iyidir.
      setErrors([
        extractErrorMessage(error, t("admin.catalog.import.templateFailed")),
      ]);
    } finally {
      setDownloading(false);
    }
  };

  /** Dialog yalnızca başarıda veya vazgeçmede kapanır; yükleme sürerken asla. */
  const close = () => {
    if (upload.isPending) return;
    setFile(null);
    setErrors([]);
    setResult(null);
    onClose();
  };

  return {
    schema: schemaQuery.data,
    schemaLoading: schemaQuery.isLoading,
    limits,
    file,
    selectFile,
    rejectFile,
    errors,
    result,
    isProcessing: upload.isPending,
    downloading,
    downloadTemplate,
    submit: () => {
      if (file) upload.mutate();
    },
    close,
    canSubmit: !!file && !upload.isPending,
  };
}
