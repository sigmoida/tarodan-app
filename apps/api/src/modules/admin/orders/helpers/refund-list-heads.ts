import {
  ADMIN_REFUND_TRADE_ROLES,
  type AdminRefundTradeRole,
} from "@tarodan/types";
import type { SortDirection } from "../../../../common/list";

/**
 * İadeler listesinin birleşik sıralamasında bir satırın başı. Talep satırı
 * talep anına, takas satırı takasın kapanışına (`cancelledAt`) göre sıralanır;
 * henüz kapanmamış (dönüşte / itirazda) takasın anı yoktur (`null`) ve "açık
 * iş" olarak en yeni sayılır.
 */
export type RefundHead =
  | { kind: "request"; id: string; at: Date }
  | {
      kind: "trade";
      id: string;
      role: AdminRefundTradeRole;
      at: Date | null;
    };

/**
 * Kaynaklar arası birleştirme sırası — kaynakların DB sırasıyla AYNI tanım:
 * an (yöne göre); anı olmayan satır `+∞` sayılır (yeni → eski sırada başta,
 * eski → yeni sırada sonda). Eşitlikte 0: `paginateMerged` önceki kaynağı
 * seçer, sayfalar deterministik kalır ve bir takasın iki satırı ayrılmaz.
 */
export function refundHeadComparator(dir: SortDirection) {
  const sign = dir === "asc" ? 1 : -1;
  const time = (head: RefundHead) =>
    head.at ? head.at.getTime() : Number.POSITIVE_INFINITY;
  return (a: RefundHead, b: RefundHead): number => {
    const left = time(a);
    const right = time(b);
    if (left === right) return 0;
    return left < right ? -sign : sign;
  };
}

/**
 * Takasların satır başları: takas başına İKİ satır (önce başlatan, sonra
 * devam ettiren). İlk `take` satır için en çok `ceil(take / 2)` takas gerekir.
 */
export function tradeRefundHeads(
  trades: readonly { id: string; cancelledAt: Date | null }[],
  take: number,
): RefundHead[] {
  return trades
    .flatMap((trade) =>
      ADMIN_REFUND_TRADE_ROLES.map(
        (role): RefundHead => ({
          kind: "trade",
          id: trade.id,
          role,
          at: trade.cancelledAt,
        }),
      ),
    )
    .slice(0, take);
}

/** `take` satır başı için okunacak takas sayısı. */
export function tradeHeadTake(take: number): number {
  return Math.ceil(take / ADMIN_REFUND_TRADE_ROLES.length);
}
