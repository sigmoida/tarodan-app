import type { Prisma } from "@prisma/client";
import {
  OFFER_EXPIRED_RULE,
  OFFER_PENDING_RULE,
  ORDER_LINE_STAGES,
  ORDER_LINE_STAGE_RULES,
  type AdminOrderFilterBucket,
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

/** Teklif: siparişe dönmüşse satırı `order` ilişkisidir. */
export const offerOrderLine: LineAdapter<Prisma.OfferWhereInput> = (line) => ({
  order: { is: line },
});

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

/** Teklif kovaları, çakışmada kazanma sırasıyla ("other" hepsinin tümleyeni). */
const OFFER_BUCKET_PRECEDENCE = [
  "new",
  "shipped",
  "in_transit",
  "delivered",
  "pending",
  "expired",
] as const satisfies readonly AdminOrderFilterBucket[];

type OfferRawBucket = (typeof OFFER_BUCKET_PRECEDENCE)[number];

function offerRawWhere(
  bucket: OfferRawBucket,
  now: Date,
): Prisma.OfferWhereInput {
  switch (bucket) {
    case "pending":
      return {
        OR: [
          {
            status: { in: [...OFFER_PENDING_RULE.openStatuses] },
            expiresAt: { gte: now },
          },
          {
            status: { in: [...OFFER_PENDING_RULE.acceptedStatuses] },
            OR: [
              { order: { is: null } },
              {
                order: {
                  is: {
                    status: { in: [...OFFER_PENDING_RULE.unpaidOrderStatuses] },
                  },
                },
              },
            ],
          },
        ],
      };
    case "expired":
      return {
        OR: [
          { status: { in: [...OFFER_EXPIRED_RULE.statuses] } },
          {
            status: { in: [...OFFER_EXPIRED_RULE.lapsedStatuses] },
            expiresAt: { lt: now },
          },
        ],
      };
    default:
      return offerOrderLine(orderLineStageWhere(bucket));
  }
}

/**
 * Teklif sekmesinin kovası. Sipariş aşaması en önce gelir (ilerlemiş sipariş
 * kazanır), sonra "Bekleyen", sonra "Süresi Dolan"; "Diğer" geri kalan her
 * şeydir (reddedilen, iptal edilen, iptal/iade edilmiş siparişli teklif).
 * Her kova kendinden önceki kovaları dışlar → her teklif tek kovada.
 */
export function offerBucketWhere(
  bucket: AdminOrderFilterBucket,
  now: Date,
): Prisma.OfferWhereInput {
  if (bucket === "other") {
    return {
      NOT: {
        OR: OFFER_BUCKET_PRECEDENCE.map((b) => offerRawWhere(b, now)),
      },
    };
  }
  const index = OFFER_BUCKET_PRECEDENCE.indexOf(bucket);
  const earlier = OFFER_BUCKET_PRECEDENCE.slice(0, index).map((b) =>
    offerRawWhere(b, now),
  );
  const parts: Prisma.OfferWhereInput[] = [offerRawWhere(bucket, now)];
  if (earlier.length > 0) parts.push({ NOT: { OR: earlier } });
  return { AND: parts };
}
