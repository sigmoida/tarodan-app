import type { Prisma } from "@prisma/client";
import {
  ORDER_CANCELLED_LINE_STATUSES,
  ORDER_LINE_STAGES,
  ORDER_LINE_STAGE_RULES,
  ORDER_REFUND_LINE_RULE,
  type OrderCartBucket,
  type OrderLineStage,
} from "@tarodan/types";

/**
 * Admin sipariş kovalarının Prisma karşılığı. Liste ve sayaç uçları AYNI
 * fonksiyonları çağırır — bir kovanın iki tanımı olamaz. Kovaların anlamı
 * `@tarodan/types` `order-buckets.ts` tablolarındadır; burası yalnız çeviridir.
 */

/** Sepetin kovası: bir ilerleme aşaması ya da kapanmış kovalardan biri. */
export type CartBucket = OrderCartBucket;

/** Satır (Order) koşulunu sepet modelinin koşuluna taşıyan adaptör: "en az bir satır". */
export type LineAdapter<TWhere> = (line: Prisma.OrderWhereInput) => TWhere;

/** CheckoutGroup: sepetin satırları `orders` ilişkisidir. */
export const groupLines: LineAdapter<Prisma.CheckoutGroupWhereInput> = (
  line,
) => ({ orders: { some: line } });

/** Grupsuz tekil sipariş: sepet tek satırın kendisidir. */
export const singleLine: LineAdapter<Prisma.OrderWhereInput> = (line) => line;

/** Bir sipariş satırının `stage` aşamasında olma koşulu. */
export function orderLineStageWhere(
  stage: OrderLineStage,
): Prisma.OrderWhereInput {
  const rule = ORDER_LINE_STAGE_RULES[stage];
  const status: Prisma.OrderWhereInput = {
    status: { in: [...rule.orderStatuses] },
  };
  if (!rule.shipment) return status;

  const inStatuses: Prisma.OrderWhereInput = {
    shipment: { is: { status: { in: [...rule.shipment.statuses] } } },
  };
  return {
    AND: [
      status,
      rule.shipment.allowMissing
        ? { OR: [{ shipment: { is: null } }, inStatuses] }
        : inStatuses,
    ],
  };
}

/** İade izi taşıyan satır (`ORDER_REFUND_LINE_RULE`). */
export function refundOrderLineWhere(): Prisma.OrderWhereInput {
  return {
    OR: [
      { status: { in: [...ORDER_REFUND_LINE_RULE.orderStatuses] } },
      {
        shipment: {
          is: { status: { in: [...ORDER_REFUND_LINE_RULE.shipmentStatuses] } },
        },
      },
    ],
  };
}

/** İptal OLMAYAN satır — "tamamı iptal" bunun yokluğudur. */
export function notCancelledOrderLineWhere(): Prisma.OrderWhereInput {
  return { status: { notIn: [...ORDER_CANCELLED_LINE_STATUSES] } };
}

/**
 * EN GERİDEKİ PAKET kuralı — tek yazıldığı yer.
 *
 * Çok satıcılı sepet, en geride kalan paketinin (satırının) aşamasındadır:
 * "Yeni" bir paketi olan sepet "Yeni"de görünür, öbür paketi teslim edilmiş
 * olsa bile. Aşama k'daki sepet = k'da en az bir satırı olan ve k'dan önceki
 * hiçbir aşamada satırı olmayan sepettir.
 *
 * Hiçbir aşamada satırı olmayan sepet KAPANMIŞTIR ve `orderCartBucketOf`'un
 * sırasıyla tam olarak bir kapanmış kovaya düşer: iade izi olan → refunds;
 * iade izi yok, iptal olmayan satır da yok → cancelled; iade izi yok ama iptal
 * olmayan satır var → other. Böylece her sepet tam olarak bir kovadadır ve
 * sayaçların toplamı sepet sayısına eşittir.
 *
 * Paket aşaması = paketin en gerideki satırı olduğundan sepet için "en gerideki
 * paket" ile "en gerideki satır" aynı sonucu verir; kural satır üzerinden
 * yazılır ki tek satırlık sepet (teklif siparişi) de aynı fonksiyondan geçsin.
 */
export function cartBucketWhere<TWhere>(
  bucket: CartBucket,
  lines: LineAdapter<TWhere>,
): TWhere {
  const stages = ORDER_LINE_STAGES.map(orderLineStageWhere);
  const closed = (...parts: TWhere[]) =>
    ({
      AND: [lines({}), { NOT: lines({ OR: stages }) } as TWhere, ...parts],
    }) as TWhere;

  switch (bucket) {
    case "refunds":
      return closed(lines(refundOrderLineWhere()));
    case "cancelled":
      return closed(
        { NOT: lines(refundOrderLineWhere()) } as TWhere,
        { NOT: lines(notCancelledOrderLineWhere()) } as TWhere,
      );
    case "other":
      return closed(
        { NOT: lines(refundOrderLineWhere()) } as TWhere,
        lines(notCancelledOrderLineWhere()),
      );
    default: {
      const index = ORDER_LINE_STAGES.indexOf(bucket);
      const earlier = stages.slice(0, index);
      const parts: TWhere[] = [lines(stages[index])];
      if (earlier.length > 0) {
        parts.push({ NOT: lines({ OR: earlier }) } as TWhere);
      }
      return { AND: parts } as TWhere;
    }
  }
}
