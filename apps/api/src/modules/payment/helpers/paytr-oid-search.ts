import type { Prisma } from "@prisma/client";
import {
  looksLikePaytrMerchantOid,
  parsePaytrMerchantOid,
  type PaytrOidSubject,
} from "@tarodan/types";
import type { PrismaService } from "../../../prisma";

/**
 * Admin aramalarında PayTR "sipariş no" (`merchant_oid`) ile kayıt bulma — TEK
 * kaynak. Biçim `@tarodan/types` `paytr-merchant-oid.ts`'tedir; burası bulunan
 * id'yi kayıtlara çevirir.
 *
 * İki ayrı kapı vardır:
 *   (a) TAM eşleşme — terim PayTR id BİÇİMİNDEYSE (`looksLikePaytrMerchantOid`,
 *       iş numarası öneki gerekmez: BST-/MEM-/id'den kurulanlar da bulunur):
 *       ödemenin güncel id'si (`providerConversationId`, indeksli) ya da eski
 *       denemeleri (`metadata.merchantOidHistory`, JSON taraması).
 *   (b) iş numarası — çözümleyici bildiği öneklerden (ORD-/GRP-/TKS-) çıkarırsa.
 * İkisi de açık değilse hiçbir şey eklenmez: normal aramalara JSON taraması
 * bindirilmez. Ödeme kimlikleri İSTEK BAŞINA BİR KEZ çözülür (`resolvePaytrOidMatch`);
 * liste/sayaç `where`'leri yalnız `id IN (...)` taşır.
 */

/** Önceki denemelerden birinin bu id olduğu ödeme. */
export function paymentOidHistoryWhere(oid: string): Prisma.PaymentWhereInput {
  return {
    metadata: { path: ["merchantOidHistory"], array_contains: oid },
  };
}

/** Güncel ya da önceki denemelerden biri bu id olan ödeme. */
export function paymentByPaytrOidWhere(oid: string): Prisma.PaymentWhereInput {
  return {
    OR: [{ providerConversationId: oid }, paymentOidHistoryWhere(oid)],
  };
}

/** Bir arama isteğinde PayTR id'sinden çözülen kayıtlar. */
export interface PaytrOidMatch {
  /** Eşleşen ödeme satırları. */
  paymentIds: string[];
  /** Bu ödemelerin bağlı olduğu tekil siparişler. */
  orderIds: string[];
  /** ...sepet grupları. */
  groupIds: string[];
  /** ...takas nakit ödemeleri. */
  tradeCashPaymentIds: string[];
  /** Id'den çıkarılan iş numaraları, kayıt türüne göre. */
  numbers: Record<PaytrOidSubject, string[]>;
}

type PaymentReader = Pick<PrismaService, "payment">;

/**
 * Terim PayTR id'si gibiyse eşleşen kayıtları TEK sorguyla çözer; değilse `null`
 * (çağıran mevcut aramasını aynen sürdürür, veritabanına hiç gidilmez).
 */
export async function resolvePaytrOidMatch(
  prisma: PaymentReader,
  term: string | undefined | null,
): Promise<PaytrOidMatch | null> {
  const exact = looksLikePaytrMerchantOid(term) ? term.trim() : null;
  const parsed = parsePaytrMerchantOid(term);
  if (!exact && !parsed) return null;

  const numbers: PaytrOidMatch["numbers"] = { order: [], group: [], trade: [] };
  for (const { subject, number } of parsed?.candidates ?? []) {
    numbers[subject].push(number);
  }

  const match: PaytrOidMatch = {
    paymentIds: [],
    orderIds: [],
    groupIds: [],
    tradeCashPaymentIds: [],
    numbers,
  };
  if (!exact) return match;

  const payments = await prisma.payment.findMany({
    where: paymentByPaytrOidWhere(exact),
    select: {
      id: true,
      orderId: true,
      checkoutGroupId: true,
      tradeCashPaymentId: true,
    },
  });
  for (const p of payments) {
    match.paymentIds.push(p.id);
    if (p.orderId) match.orderIds.push(p.orderId);
    if (p.checkoutGroupId) match.groupIds.push(p.checkoutGroupId);
    if (p.tradeCashPaymentId)
      match.tradeCashPaymentIds.push(p.tradeCashPaymentId);
  }
  return match;
}

/**
 * Sipariş satırı için ek `OR` kolları: eşleşen ödemenin siparişi / sepeti ve iş
 * numaraları. Eşleşme yoksa boş dizi.
 */
export function orderPaytrOidClauses(
  match: PaytrOidMatch | null | undefined,
): Prisma.OrderWhereInput[] {
  if (!match) return [];
  const clauses: Prisma.OrderWhereInput[] = [];
  if (match.orderIds.length > 0) clauses.push({ id: { in: match.orderIds } });
  if (match.groupIds.length > 0) {
    clauses.push({ checkoutGroupId: { in: match.groupIds } });
  }
  if (match.numbers.order.length > 0) {
    clauses.push({ orderNumber: { in: match.numbers.order } });
  }
  if (match.numbers.group.length > 0) {
    clauses.push({
      checkoutGroup: { groupNumber: { in: match.numbers.group } },
    });
  }
  return clauses;
}

/** Takas için ek `OR` kolları: nakit ödemesi eşleşen takas ve takas numarası. */
export function tradePaytrOidClauses(
  match: PaytrOidMatch | null | undefined,
): Prisma.TradeWhereInput[] {
  if (!match) return [];
  const clauses: Prisma.TradeWhereInput[] = [];
  if (match.tradeCashPaymentIds.length > 0) {
    clauses.push({
      cashPayments: { some: { id: { in: match.tradeCashPaymentIds } } },
    });
  }
  if (match.numbers.trade.length > 0) {
    clauses.push({ tradeNumber: { in: match.numbers.trade } });
  }
  return clauses;
}
