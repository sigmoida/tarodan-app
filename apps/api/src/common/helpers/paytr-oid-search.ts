import type { Prisma } from "@prisma/client";
import { parsePaytrMerchantOid, type PaytrOidSubject } from "@tarodan/types";

/**
 * Admin aramalarında PayTR "sipariş no" (`merchant_oid`) ile kayıt bulma — TEK
 * kaynak. Biçim `@tarodan/types` `paytr-merchant-oid.ts`'tedir; burası yalnız
 * bulunan id'yi Prisma koşuluna çevirir.
 *
 * PayTR yolu SADECE terim bir PayTR id'si gibi görününce açılır (çözümleyici
 * `null` dönerse hiçbir şey eklenmez): normal aramalara JSON taraması
 * bindirilmez. Eşleşme iki kaynaktan gelir:
 *   (a) ödemenin güncel id'si (`providerConversationId`, indeksli) ya da eski
 *       denemeleri (`metadata.merchantOidHistory`) — TAM eşleşme;
 *   (b) id'den çıkarılan iş numarası (ORD-/GRP-/TKS-) — ödeme satırı/geçmişi
 *       kaybolmuş olsa da kayda ulaşır.
 */
export interface PaytrOidSearch {
  /** Terimin normalleştirilmiş PayTR id'si. */
  oid: string;
  /** Güncel id ya da geçmiş denemelerden biri bu id olan ödeme. */
  payment: Prisma.PaymentWhereInput;
  /** Id'den çıkarılan iş numaraları, kayıt türüne göre. */
  numbers: Record<PaytrOidSubject, string[]>;
}

/** Bir ödeme satırının bu id'yi taşıdığı koşul (güncel ya da geçmiş). */
export function paymentByPaytrOidWhere(oid: string): Prisma.PaymentWhereInput {
  return {
    OR: [
      { providerConversationId: oid },
      { metadata: { path: ["merchantOidHistory"], array_contains: oid } },
    ],
  };
}

/** Terim PayTR id'si değilse `null` — çağıran mevcut aramasını aynen sürdürür. */
export function paytrOidSearchOf(
  term: string | undefined | null,
): PaytrOidSearch | null {
  const parsed = parsePaytrMerchantOid(term);
  if (!parsed) return null;
  const numbers: PaytrOidSearch["numbers"] = {
    order: [],
    group: [],
    trade: [],
  };
  for (const { subject, number } of parsed.candidates) {
    numbers[subject].push(number);
  }
  return {
    oid: parsed.oid,
    payment: paymentByPaytrOidWhere(parsed.oid),
    numbers,
  };
}

/**
 * Sipariş satırı için ek `OR` kolları: kendi ödemesi, sepet ödemesi ve iş
 * numaraları. Terim PayTR id'si değilse boş dizi.
 */
export function orderPaytrOidClauses(
  term: string | undefined | null,
): Prisma.OrderWhereInput[] {
  const search = paytrOidSearchOf(term);
  if (!search) return [];
  const { payment, numbers } = search;
  const clauses: Prisma.OrderWhereInput[] = [
    { payment },
    { checkoutGroup: { payment } },
  ];
  if (numbers.order.length > 0) {
    clauses.push({ orderNumber: { in: numbers.order } });
  }
  if (numbers.group.length > 0) {
    clauses.push({ checkoutGroup: { groupNumber: { in: numbers.group } } });
  }
  return clauses;
}

/** Takas için ek `OR` kolları: takasın nakit ödemeleri ve takas numarası. */
export function tradePaytrOidClauses(
  term: string | undefined | null,
): Prisma.TradeWhereInput[] {
  const search = paytrOidSearchOf(term);
  if (!search) return [];
  const clauses: Prisma.TradeWhereInput[] = [
    { cashPayments: { some: { payment: search.payment } } },
  ];
  if (search.numbers.trade.length > 0) {
    clauses.push({ tradeNumber: { in: search.numbers.trade } });
  }
  return clauses;
}
