"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { extractImportErrors } from "@/lib/error";

export interface EligibleProductImportSeller {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string;
  taxId: string | null;
}

export interface ProductImportLimits {
  maxRows: number;
  maxImagesPerProduct: number;
  minImagesPerProduct: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  maxImages: number;
}

export interface ProductImportResult {
  success: true;
  status: "completed";
  batchId: string;
  createdCount: number;
  seller: { displayName: string; companyName: string | null };
  products: Array<{
    id: string;
    productCode: string;
    reference: string;
    title: string;
  }>;
}

interface ProductImportPendingResult {
  success: false;
  status: "processing" | "failed";
  batchId: string;
  errors: string[];
}

type ProductImportResponse = ProductImportResult | ProductImportPendingResult;

const FALLBACK_LIMITS: ProductImportLimits = {
  maxRows: 25,
  maxImagesPerProduct: 10,
  minImagesPerProduct: 3,
  maxTotalBytes: 150 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxImages: 250,
};

/**
 * Durum sorgusunun üst sınırı. Sunucu yarıda kalan kayıtları 30 dk sonra
 * `failed`'a çeviriyor; istemci daha erken vazgeçip modalı serbest bırakır,
 * kullanıcı sonucu daha sonra yeniden açıp batch kimliğinden görebilir.
 */
const BATCH_POLL_TIMEOUT_MS = 5 * 60 * 1000;

function normalizedFilename(file: File): string {
  return file.name.normalize("NFC").trim().toLocaleLowerCase("tr-TR");
}

export function productImportFileKey(file: File): string {
  return `${normalizedFilename(file)}:${file.size}:${file.lastModified}`;
}

export function formatProductImportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function useProductBulkImport(open: boolean, onClose: () => void) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [sellerId, setSellerId] = useState("");
  const [workbook, setWorkbookState] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [pollDeadline, setPollDeadline] = useState<number | null>(null);

  /**
   * Durum sorgusu, `processing` gördüğü sürece kendini yeniliyor. İşi yürüten
   * süreç ölürse kayıt asılı kalır; tavan olmadan modal sonsuza dek sorgular ve
   * `close()` de `activeBatchId` doluyken kapanmayı reddettiği için kullanıcı
   * kilitlenir. Tavan dolunca sorguyu durdurup modalı serbest bırakırız.
   */
  const beginPolling = (id: string) => {
    setActiveBatchId(id);
    setPollDeadline(Date.now() + BATCH_POLL_TIMEOUT_MS);
  };
  const stopPolling = () => {
    setActiveBatchId(null);
    setPollDeadline(null);
  };

  /**
   * KESİN başarısızlık: sunucu batch'i `failed` olarak kapattı. Kayıt ancak
   * ürünlerle aynı transaction'da `completed` olduğu için başarısız bir batch
   * HİÇ ürün oluşturmamıştır — tekrar denemek güvenlidir. Aynı
   * Idempotency-Key ile denenirse sunucu saklı hatayı aynen döndürür ve
   * kullanıcı hiç iş yapılmadan aynı mesajı görür; bu yüzden yeni anahtar.
   */
  const failBatch = (messages: string[]) => {
    setServerErrors(messages);
    stopPolling();
    setBatchId(crypto.randomUUID());
  };

  /**
   * SONUCU BİLİNMEYEN durum (durum ucuna erişilemedi ya da sorgu tavanı doldu):
   * iş sunucuda hâlâ koşuyor olabilir. Anahtarı KORURUZ — aynı dosyalarla
   * yeniden gönderim sunucuda tekilleştirilir ve çift ürün oluşmaz. Yeni anahtar
   * üretmek tam da idempotency'nin engellediği mükerrer kaydı geri getirirdi.
   */
  const abandonPolling = (messages: string[]) => {
    setServerErrors(messages);
    stopPolling();
  };

  const sellersQuery = useQuery<{
    sellers: EligibleProductImportSeller[];
    limits: ProductImportLimits;
  }>({
    queryKey: adminKeys.options("product-import-sellers"),
    queryFn: async () => {
      const payload = (await adminApi.getProductImportSellers()).data;
      return {
        sellers: payload?.data ?? [],
        limits: payload?.limits ?? FALLBACK_LIMITS,
      };
    },
    enabled: open,
  });

  const limits = sellersQuery.data?.limits ?? FALLBACK_LIMITS;
  const batchQuery = useQuery<ProductImportResponse>({
    queryKey: adminKeys.detail(
      "product-import-batch",
      activeBatchId ?? "pending",
    ),
    queryFn: () =>
      adminApi
        .getProductImportBatch(activeBatchId!)
        .then((response) => response.data as ProductImportResponse),
    enabled: open && !!activeBatchId,
    refetchInterval: (query) =>
      query.state.data?.status === "processing" &&
      (pollDeadline === null || Date.now() < pollDeadline)
        ? 1500
        : false,
    retry: 10,
    retryDelay: 1500,
  });
  const clientErrors = useMemo(() => {
    const issues: string[] = [];
    const files = [workbook, ...images].filter(Boolean) as File[];
    const oversized = files.find((file) => file.size > limits.maxFileBytes);
    if (oversized) {
      issues.push(
        t("admin.catalog.products.bulkImportFileTooLarge", {
          name: oversized.name,
          size: formatProductImportFileSize(limits.maxFileBytes),
        }),
      );
    }
    if (images.length > limits.maxImages) {
      issues.push(
        t("admin.catalog.products.bulkImportTooManyImages", {
          max: limits.maxImages,
        }),
      );
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > limits.maxTotalBytes) {
      issues.push(
        t("admin.catalog.products.bulkImportTotalTooLarge", {
          size: formatProductImportFileSize(limits.maxTotalBytes),
        }),
      );
    }
    return issues;
  }, [images, limits, t, workbook]);

  const upload = useAdminMutation(
    async () =>
      adminApi
        .bulkImportProducts({
          batchId,
          sellerId,
          workbook: workbook!,
          images,
          onUploadProgress: setUploadProgress,
        })
        .then((response) => response.data as ProductImportResponse)
        .catch((error) => {
          if (!(error as any)?.response) {
            beginPolling(batchId);
            return {
              success: false,
              status: "processing",
              batchId,
              errors: [],
            } satisfies ProductImportPendingResult;
          }
          setServerErrors(
            extractImportErrors(
              error,
              t("admin.catalog.products.bulkImportFailed"),
            ),
          );
          throw error;
        }),
    {
      invalidates: ["products"],
      showErrorToast: false,
      onSuccess: (data) => {
        setUploadProgress(100);
        setServerErrors([]);
        if (data.status === "completed") {
          setResult(data);
        } else if (data.status === "failed") {
          failBatch(data.errors);
        } else {
          beginPolling(data.batchId);
        }
      },
      mutation: {
        onMutate: () => {
          setUploadProgress(0);
          setServerErrors([]);
          setResult(null);
        },
      },
    },
  );

  useEffect(() => {
    const data = batchQuery.data;
    if (!data || !activeBatchId) return;
    if (data.status === "completed") {
      setResult(data);
      setServerErrors([]);
      stopPolling();
      void queryClient.invalidateQueries({
        queryKey: adminKeys.all("products"),
      });
    } else if (data.status === "failed") {
      failBatch(data.errors);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatchId, batchQuery.data, queryClient]);

  useEffect(() => {
    if (!activeBatchId || !batchQuery.isError) return;
    abandonPolling([t("admin.catalog.products.bulkImportStatusUnavailable")]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatchId, batchQuery.isError, t]);

  // Sorgu tavanı dolduğunda modalı serbest bırak: kullanıcı kilitli kalmasın.
  useEffect(() => {
    if (!activeBatchId || pollDeadline === null) return;
    const timer = setTimeout(
      () =>
        abandonPolling([t("admin.catalog.products.bulkImportStatusTimeout")]),
      Math.max(0, pollDeadline - Date.now()),
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatchId, pollDeadline, t]);

  const resetFeedback = () => {
    setServerErrors([]);
    setResult(null);
    setBatchId(crypto.randomUUID());
  };
  const selectSeller = (value: string) => {
    setSellerId(value);
    resetFeedback();
  };
  const setWorkbook = (file: File | null) => {
    setWorkbookState(file);
    resetFeedback();
  };
  const addImages = (selected: File[]) => {
    setImages((current) => {
      const byName = new Map(
        current.map((file) => [normalizedFilename(file), file]),
      );
      selected.forEach((file) => byName.set(normalizedFilename(file), file));
      return Array.from(byName.values());
    });
    resetFeedback();
  };
  const removeImage = (target: File) => {
    const name = normalizedFilename(target);
    setImages((current) =>
      current.filter((file) => normalizedFilename(file) !== name),
    );
    resetFeedback();
  };
  const close = () => {
    if (upload.isPending || activeBatchId) return;
    setSellerId("");
    setWorkbookState(null);
    setImages([]);
    setServerErrors([]);
    setResult(null);
    setUploadProgress(0);
    setBatchId(crypto.randomUUID());
    stopPolling();
    onClose();
  };
  const submit = () => {
    if (!clientErrors.length) upload.mutate();
  };

  return {
    sellerId,
    setSellerId: selectSeller,
    workbook,
    setWorkbook,
    images,
    addImages,
    removeImage,
    errors: [...clientErrors, ...serverErrors],
    result,
    uploadProgress,
    upload,
    isProcessing: upload.isPending || !!activeBatchId,
    close,
    submit,
    limits,
    sellers: sellersQuery.data?.sellers ?? [],
    sellersLoading: sellersQuery.isLoading,
    disabled:
      !sellerId ||
      !workbook ||
      images.length < limits.minImagesPerProduct ||
      clientErrors.length > 0,
  };
}
