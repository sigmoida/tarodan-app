import type { Prisma } from "@prisma/client";
import {
  ORDER_LINE_STAGES,
  ORDER_LINE_STAGE_RULES,
  type OrderLineStage,
} from "@tarodan/types";

/**
 * Admin sipariş kovalarının Prisma karşılığı. Liste ve sayaç uçları AYNI
 * fonksiyonları çağırır — bir kovanın iki tanımı olamaz. Kovaların anlamı
 * `@tarodan/types` `order-buckets.ts` tablolarındadır; burası yalnız çeviridir.
 */

/** Sepetin kovası: bir ilerleme aşaması ya da "other". */
export type CartBucket = OrderLineStage | "other";

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

/**
 * EN GERİDEKİ PAKET kuralı — tek yazıldığı yer.
 *
 * Çok satıcılı sepet, en geride kalan paketinin (satırının) aşamasındadır:
 * "Yeni" bir paketi olan sepet "Yeni"de görünür, öbür paketi teslim edilmiş
 * olsa bile. Aşama k'daki sepet = k'da en az bir satırı olan ve k'dan önceki
 * hiçbir aşamada satırı olmayan sepettir. Aşamaların hiçbirinde satırı yoksa
 * "other"dır (tamamı iptal / iade / ödeme bekliyor…). Böylece her sepet tam
 * olarak bir kovadadır ve sayaçların toplamı sepet sayısına eşittir.
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
  if (bucket === "other") {
    return {
      AND: [lines({}), { NOT: lines({ OR: stages }) }],
    } as TWhere;
  }
  const index = ORDER_LINE_STAGES.indexOf(bucket);
  const earlier = stages.slice(0, index);
  const parts: TWhere[] = [lines(stages[index])];
  if (earlier.length > 0) {
    parts.push({ NOT: lines({ OR: earlier }) } as TWhere);
  }
  return { AND: parts } as TWhere;
}
