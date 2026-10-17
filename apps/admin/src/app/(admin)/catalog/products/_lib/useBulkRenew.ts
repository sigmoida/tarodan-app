import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import {
  chunkIds,
  failedChunk,
  mergeRenewBatches,
  readRenewBatch,
  renewableRows,
  type RenewBatchResult,
  type RenewTarget,
} from "./bulkRenew";

/** Sonuç diyaloğunun gösterdiği: sonuç + satır başlıkları için hedefler. */
export interface RenewReport {
  result: RenewBatchResult;
  targets: RenewTarget[];
}

/**
 * İstekleri sunucu üst sınırına göre SIRAYLA parçalar (sunucu da sıralı işler).
 * Tek parça düşerse onun ilanları genel nedenle başarısız sayılır, diğerleri
 * etkilenmez; hiçbir parça ulaşmazsa ilk hata ortak hata toast'ına gider.
 */
async function callBulkRenew(ids: string[]): Promise<RenewBatchResult> {
  const batches: RenewBatchResult[] = [];
  let firstError: unknown;
  let reached = 0;
  for (const chunk of chunkIds(ids)) {
    try {
      const { data } = await adminApi.bulkRenewExpiredProducts(chunk);
      batches.push(readRenewBatch(data));
      reached += 1;
    } catch (error) {
      firstError ??= error;
      batches.push(failedChunk(chunk));
    }
  }
  if (reached === 0) throw firstError;
  return mergeRenewBatches(batches);
}

/**
 * Süresi dolmuş ilanları toplu yenilemenin TEK sahibi: onay → mutasyon →
 * özet toast'ı → başarısızlar için sonuç diyaloğu. Onaylanıp gönderildiyse
 * `run` true döner (seçimi temizlemek için).
 */
export function useBulkRenew() {
  const t = useTranslations();
  const confirm = useConfirm();
  const [report, setReport] = useState<RenewReport | null>(null);

  const mutation = useAdminMutation(
    (v: { ids: string[]; targets: RenewTarget[] }) => callBulkRenew(v.ids),
    {
      invalidates: ["products"],
      onSuccess: (result, vars) => {
        const text = t("admin.catalog.products.bulkRenewResult", {
          ok: result.renewed,
          failed: result.failed,
        });
        if (result.failed === 0) toast.success(text);
        else if (result.renewed === 0) toast.error(text);
        else toast(text, { icon: "⚠️" });
        if (result.failed > 0) setReport({ result, targets: vars.targets });
      },
    },
  );

  const run = async (rows: readonly RenewTarget[]): Promise<boolean> => {
    const targets = renewableRows(rows);
    if (targets.length === 0) return false;
    return confirm({
      title: t("admin.catalog.products.bulkRenewConfirmTitle", {
        count: targets.length,
      }),
      description: t("admin.catalog.products.bulkRenewConfirmDescription"),
      confirmLabel: t("admin.catalog.products.bulkRenew"),
      onConfirm: () =>
        mutation.mutateAsync({ ids: targets.map((r) => r.id), targets }),
    });
  };

  return {
    run,
    isPending: mutation.isPending,
    report,
    closeReport: () => setReport(null),
  };
}
