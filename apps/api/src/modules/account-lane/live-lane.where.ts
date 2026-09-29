import { Prisma } from "@prisma/client";

/**
 * Raporlama için CANLI şerit yüklemleri — TEK kaynak.
 *
 * Kural ikiye ayrılır ve bu dosya yalnız birinci yarının aracıdır:
 *
 * - **Raporlar, panolar, analitik, finans özeti, alarm sayaçları** test şeridini
 *   HARİÇ tutar. Test ödemesi PayTR test modunda geçer, tahsilat yoktur; ciroya,
 *   hak edişe ya da "bekleyen iş" sayacına girerse rakam yalan söyler ve
 *   kapanmayacak bir alarm üretir.
 * - **Operasyonel listeler** (sipariş/iptal/iade listesi ve detayları) test
 *   kayıtlarını GÖSTERİR ama `isTest` alanıyla "TEST" rozeti basar. Onlar bu
 *   dosyayı KULLANMAZ; bir kaydı listeden gizlemek, onu yöneten operatörü kör
 *   eder.
 *
 * Damganın kaynağı DB'dir: `orders` / `payments` / `trades` / `ledger_entries`
 * üzerindeki `is_test` kolonunu BEFORE INSERT trigger'ı `User.isTestAccount`tan
 * türetir (bkz. 20260922120000_production_test_lane). Damgası olmayan tablolar
 * (defter, iade, üyelik ödemesi, öne çıkarma…) bağlı oldukları damgalı satırdan
 * ya da sahiplerinin hesabından okunur — aşağıdaki türetmeler bunu tek yerde
 * yazar ki her rapor aynı kümeyi saysın.
 */

/** Damgalı tablolar: `isTest = false`. */
export const LIVE_ORDER = { isTest: false } satisfies Prisma.OrderWhereInput;
export const LIVE_PAYMENT = {
  isTest: false,
} satisfies Prisma.PaymentWhereInput;
export const LIVE_TRADE = { isTest: false } satisfies Prisma.TradeWhereInput;
export const LIVE_LEDGER_ENTRY = {
  isTest: false,
} satisfies Prisma.LedgerEntryWhereInput;

/** Hesap bayrağı: test hesapları (ve onların ilan/üyelik/öne çıkarmaları) dışarıda. */
export const LIVE_USER = {
  isTestAccount: false,
} satisfies Prisma.UserWhereInput;

/** Komisyon defteri siparişe bağlıdır (`orderId` zorunlu). */
export const LIVE_COMMISSION_LEDGER = {
  order: LIVE_ORDER,
} satisfies Prisma.CommissionLedgerWhereInput;

/** İade talebi siparişe bağlıdır (`orderId` zorunlu). */
export const LIVE_REFUND_REQUEST = {
  order: LIVE_ORDER,
} satisfies Prisma.RefundRequestWhereInput;

/**
 * İade denemesi her zaman bir ödemeye bağlıdır (sipariş VE takas iadeleri) —
 * ödemenin damgası iki yolu birden kapsar.
 */
export const LIVE_REFUND_ATTEMPT = {
  payment: LIVE_PAYMENT,
} satisfies Prisma.RefundAttemptWhereInput;

/** Takas nakit ödemesi takasına bağlıdır. */
export const LIVE_TRADE_CASH_PAYMENT = {
  trade: LIVE_TRADE,
} satisfies Prisma.TradeCashPaymentWhereInput;

/**
 * Üyelik ödemesi: oto-yenilemede `orderId` NULL olduğu için damgalı bir satıra
 * bağlanamaz — üyeliğin SAHİBİNİN bayrağından okunur (ilk alım da aynı kişidir).
 */
export const LIVE_MEMBERSHIP_PAYMENT = {
  membership: { user: LIVE_USER },
} satisfies Prisma.MembershipPaymentWhereInput;

/** Üyeliğin kendisi (stok/katman sayıları). */
export const LIVE_USER_MEMBERSHIP = {
  user: LIVE_USER,
} satisfies Prisma.UserMembershipWhereInput;

/** Öne çıkarma: satın alan = ilan sahibi. */
export const LIVE_PRODUCT_BOOST = {
  user: LIVE_USER,
} satisfies Prisma.ProductBoostWhereInput;

/**
 * Teklif: şerit kapısı alıcı ile satıcıyı aynı şeride zorlar, bu yüzden alıcının
 * şeridi teklifin şerididir.
 */
export const LIVE_OFFER = {
  buyer: LIVE_USER,
} satisfies Prisma.OfferWhereInput;

/** İlan: satıcısının şeridi. */
export const LIVE_PRODUCT = {
  seller: LIVE_USER,
} satisfies Prisma.ProductWhereInput;

/**
 * Payout'lar damga taşımaz (test şeridinde payout hiç açılmaz — bkz.
 * PayoutService). Pozitif bir ilişki filtresi hold'suz/TCP'siz canlı
 * transferleri de düşürürdü; bu yüzden yalnız AÇIKÇA test olan transferler
 * NOT ile elenir.
 */
export const LIVE_PAYOUT_TRANSFER = {
  NOT: {
    OR: [
      { paymentHold: { payment: { isTest: true } } },
      { tradeCashPayment: { payment: { isTest: true } } },
    ],
  },
} satisfies Prisma.PayoutTransferWhereInput;

// ───────────────────────────── SQL karşılıkları ─────────────────────────────
// Ham SQL raporları (zaman kovaları, medyanlar, CTE'ler) AYNI kuralı yazar.
// `alias` her zaman çağıranın LİTERALİdir — istekten türetilmiş bir şey değil.

const quoted = (alias: string) => Prisma.raw(`"${alias}"`);

/** `"<alias>"."is_test" = false` — orders / payments / trades takma adı için. */
export function liveRowSql(alias: string): Prisma.Sql {
  return Prisma.sql`${quoted(alias)}."is_test" = false`;
}

/** Siparişe bağlı bir satır (iade talebi, defter, gönderi…) için canlı sipariş koşulu. */
export function liveOrderRefSql(orderIdColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "orders" lane_o
    WHERE lane_o."id" = ${orderIdColumn} AND lane_o."is_test" = false
  )`;
}

/** Takasa bağlı bir satır (takas nakit ödemesi) için canlı takas koşulu. */
export function liveTradeRefSql(tradeIdColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "trades" lane_t
    WHERE lane_t."id" = ${tradeIdColumn} AND lane_t."is_test" = false
  )`;
}

/** Bir kullanıcıya bağlı satır (ilan, öne çıkarma, üyelik) için canlı hesap koşulu. */
export function liveUserRefSql(userIdColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "users" lane_u
    WHERE lane_u."id" = ${userIdColumn} AND lane_u."is_test_account" = false
  )`;
}

/** Kolon referansı: `"alias"."column"` (ikisi de literal). */
export function col(alias: string, column: string): Prisma.Sql {
  return Prisma.raw(`"${alias}"."${column}"`);
}

/** {@link LIVE_PAYOUT_TRANSFER}'in SQL karşılığı — `payout_transfers` takma adı için. */
export function livePayoutTransferSql(alias: string): Prisma.Sql {
  const pt = quoted(alias);
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "payment_holds" lane_h
    JOIN "payments" lane_p ON lane_p."id" = lane_h."payment_id"
    WHERE lane_h."id" = ${pt}."payment_hold_id" AND lane_p."is_test" = true
  ) AND NOT EXISTS (
    SELECT 1 FROM "payments" lane_p
    WHERE lane_p."trade_cash_payment_id" = ${pt}."trade_cash_payment_id"
      AND lane_p."is_test" = true
  )`;
}

/** {@link LIVE_MEMBERSHIP_PAYMENT}'in SQL karşılığı — `membership_payments` takma adı için. */
export function liveMembershipPaymentSql(alias: string): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "user_memberships" lane_m
    JOIN "users" lane_u ON lane_u."id" = lane_m."user_id"
    WHERE lane_m."id" = ${quoted(alias)}."membership_id"
      AND lane_u."is_test_account" = false
  )`;
}
