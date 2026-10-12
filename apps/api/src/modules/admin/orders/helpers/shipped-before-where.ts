import { OrderStatus, type Prisma } from "@prisma/client";

/**
 * "Uzun süredir kargoda" kümesi — TEK tanım.
 *
 * Dashboard'un `stuckShippedOrders` uyarısı (eşik: Süreler ve Kurallar →
 * `shippedStaleAlertDays`) ile sipariş listesinin `shippedBefore` süzgeci aynı
 * yüklemi okur: uyarının "N sipariş" dediği küme ile bağlantının açtığı liste
 * ayrışamaz.
 */
export function shippedBeforeWhere(cutoff: Date): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.shipped,
    shipment: { is: { shippedAt: { lt: cutoff } } },
  };
}

/** Eşiğin kesim anı: `now`'dan `days` gün önce. */
export function shippedStaleCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
