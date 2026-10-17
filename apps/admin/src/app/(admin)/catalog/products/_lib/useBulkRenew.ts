import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import {
  chunkIds,
  isUnknown,
  mergeRenewBatches,
  readRenewBatch,
  reconcileUnknown,
  renewableRows,
  unknownChunk,
  type CurrentListing,
  type RenewBatchResult,
  type RenewTarget,
} from "./bulkRenew";

/** Sonuç diyaloğunun gösterdiği: sonuç + satır başlıkları için hedefler. */
export interface RenewReport {
  result: RenewBatchResult;
  targets: RenewTarget[];
}

/** Aynı anda en çok bu kadar ilan okunur (düşen parçanın durum doğrulaması). */
const STATUS_READ_CONCURRENCY = 10;

/** İlanların güncel durumunu okur; okunamayan `null` olur. */
async function readCurrent(
  ids: string[],
): Promise<Map<string, CurrentListing>> {
  const current = new Map<string, CurrentListing>();
  for (let i = 0; i < ids.length; i += STATUS_READ_CONCURRENCY) {
    const group = ids.slice(i, i + STATUS_READ_CONCURRENCY);
    const settled = await Promise.allSettled(
      group.map((id) => adminApi.getProduct(id)),
    );
    settled.forEach((outcome, index) => {
      const body = outcome.status === "fulfilled" ? outcome.value.data : null;
      const product = body?.data?.status ? body.data : body;
      current.set(
        group[index],
        product?.status
          ? { status: product.status, inactiveReason: product.inactiveReason }
          : null,
      );
    });
  }
  return current;
}

/**
 * İstekleri sunucu üst sınırına göre SIRAYLA parçalar (sunucu da sıralı işler).
 * Yanıtsız düşen parça "bilinmiyor" sayılır (sunucu kısmen yenilemiş olabilir)
 * ve ilanları yeniden okunarak yenilendi / başarısız / bilinmiyor diye
 * sınıflanır. Hiçbir parça ulaşmadıysa ve hiçbir ilan yenilenmediyse ilk hata
 * ortak hata toast'ına gider.
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
      batches.push(unknownChunk(chunk));
    }
  }
  let merged = mergeRenewBatches(batches);
  if (merged.unknown > 0) {
    const unknownIds = merged.results.filter(isUnknown);
    merged = reconcileUnknown(
      merged,
      await readCurrent(unknownIds.map((r) => r.id)),
    );
  }
  if (reached === 0 && merged.renewed === 0) throw firstError;
  return merged;
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
  // Sonuç diyaloğu, onay penceresi kapanana dek bekler (iki modal üst üste açılmaz).
  const pendingReport = useRef<RenewReport | null>(null);

  const mutation = useAdminMutation(
    (v: { ids: string[]; targets: RenewTarget[] }) => callBulkRenew(v.ids),
    {
      invalidates: ["products"],
      onSuccess: (result, vars) => {
        const counts = {
          ok: result.renewed,
          failed: result.failed,
          unknown: result.unknown,
        };
        const text =
          result.unknown > 0
            ? t("admin.catalog.products.bulkRenewResultUnknown", counts)
            : t("admin.catalog.products.bulkRenewResult", counts);
        const problems = result.failed + result.unknown;
        if (problems === 0) toast.success(text);
        else if (result.renewed === 0) toast.error(text);
        else toast(text, { icon: "⚠️" });
        pendingReport.current =
          problems > 0 ? { result, targets: vars.targets } : null;
      },
    },
  );

  const run = async (rows: readonly RenewTarget[]): Promise<boolean> => {
    const targets = renewableRows(rows);
    if (targets.length === 0) return false;
    pendingReport.current = null;
    const submitted = await confirm({
      title: t("admin.catalog.products.bulkRenewConfirmTitle", {
        count: targets.length,
      }),
      description: t("admin.catalog.products.bulkRenewConfirmDescription"),
      confirmLabel: t("admin.catalog.products.bulkRenew"),
      onConfirm: () =>
        mutation.mutateAsync({ ids: targets.map((r) => r.id), targets }),
    });
    // Onay penceresi kapandıktan SONRA aç.
    if (pendingReport.current) setReport(pendingReport.current);
    pendingReport.current = null;
    return submitted;
  };

  return {
    run,
    isPending: mutation.isPending,
    report,
    closeReport: () => setReport(null),
  };
}
