import type { SortDirection } from "../../../../common/list";

/** İptal listesinin birleşik sıralamasında bir satırın başı. */
export interface CancellationHead {
  kind: "group" | "order" | "trade";
  id: string;
  /** Satırın iptal anı; damga öncesi iptalde null. */
  cancelledAt: Date | null;
}

/**
 * Kaynaklar arası birleştirme sırası — kaynakların DB sırasıyla AYNI tanım:
 * iptal anı (yöne göre), anı olmayan satır yön ne olursa olsun SONA. Eşitlikte
 * 0 döner; `paginateMerged` eşitlikte önceki kaynağı seçer, sayfalar
 * deterministik kalır.
 */
export function cancellationHeadComparator(dir: SortDirection) {
  const sign = dir === "asc" ? 1 : -1;
  return (a: CancellationHead, b: CancellationHead): number => {
    if (!a.cancelledAt && !b.cancelledAt) return 0;
    if (!a.cancelledAt) return 1;
    if (!b.cancelledAt) return -1;
    return (a.cancelledAt.getTime() - b.cancelledAt.getTime()) * sign;
  };
}
