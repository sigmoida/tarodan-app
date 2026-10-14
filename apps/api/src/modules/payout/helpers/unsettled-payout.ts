import {
  PaymentHoldStatus,
  PaymentStatus,
  PayoutStatus,
  RefundAttemptStatus,
  type Prisma,
} from "@prisma/client";
import {
  entitledNetFromHold,
  PAYOUT_FAILURE_FULLY_REFUNDED,
  PAYOUT_MIN_NET,
} from "./payout-entitlement";

/** Ödenmemiş hakediş denetiminin okuduğu tablolar (prisma ya da tx). */
export type UnsettledPayoutDb = Pick<
  Prisma.TransactionClient,
  "payoutTransfer" | "paymentHold" | "tradeCashPayment" | "refundAttempt"
>;

/** Transferi henüz sonuçlanmamış payout durumları (para yolda ya da kuyrukta). */
const OPEN_PAYOUT_STATUSES: PayoutStatus[] = [
  PayoutStatus.pending,
  PayoutStatus.processing,
  PayoutStatus.retry_pending,
  PayoutStatus.returned,
];

/**
 * `failed` payout'ta satıcıya hâlâ para borçlu muyuz? Admin retry'ı ve
 * iade-void yeniden kuyruğu (`order_refunded`) failed satırı canlandırabilir;
 * yalnız hold'u tamamen tükenmiş (tam iade) satır kalıcı olarak kapanmıştır.
 */
function failedPayoutStillOwed(payout: {
  failureReason: string | null;
  paymentHold: { amount: unknown; refundedAmount: unknown } | null;
}): boolean {
  if (payout.failureReason === PAYOUT_FAILURE_FULLY_REFUNDED) return false;
  if (payout.paymentHold) {
    return entitledNetFromHold(payout.paymentHold) > PAYOUT_MIN_NET;
  }
  return true;
}

/**
 * Satıcıya ödenmesi gereken ama henüz ödenmemiş para var mı? Payout üreticisi
 * (`PayoutService.createPayoutsForReleasedHolds`) ve transfer işlemcisi
 * IBAN'ı İŞLEM ANINDA `SellerBankAccount`'tan okur; bu yüklem `true` iken
 * banka hesabı silinirse hakediş `no_bank_account` ile düşer.
 *
 * Üreticinin kurallarıyla hizalıdır:
 * - açık payout (pending/processing/retry_pending/returned) → borç;
 * - `failed` payout → tam iade edilmiş değilse borç (admin retry / iade-void);
 * - payout'u üretilmemiş hold (held/released) → test şeridi değilse ve
 *   hak edilen net sıfır değilse borç (üretici test ödemesine transfer yapmaz);
 * - payout'u üretilmemiş takas nakit farkı → test şeridi değilse ve tutar
 *   ödeyene iade EDİLMEDİYSE borç (üretici sonuçlanmamış iade denemesinde
 *   bekler; o deneme başarısız olursa para yine satıcıya gider).
 */
export async function hasUnsettledPayout(
  db: UnsettledPayoutDb,
  sellerId: string,
): Promise<boolean> {
  const openTransfers = await db.payoutTransfer.count({
    where: { sellerId, status: { in: OPEN_PAYOUT_STATUSES } },
  });
  if (openTransfers > 0) return true;

  const failedTransfers = await db.payoutTransfer.findMany({
    where: { sellerId, status: PayoutStatus.failed },
    select: {
      failureReason: true,
      paymentHold: { select: { amount: true, refundedAmount: true } },
    },
  });
  if (failedTransfers.some(failedPayoutStillOwed)) return true;

  const pendingHolds = await db.paymentHold.findMany({
    where: {
      sellerId,
      status: { in: [PaymentHoldStatus.held, PaymentHoldStatus.released] },
      payoutTransfer: null,
      payment: { isTest: false },
    },
    select: { amount: true, refundedAmount: true },
  });
  if (pendingHolds.some((hold) => entitledNetFromHold(hold) > PAYOUT_MIN_NET)) {
    return true;
  }

  const tradeCash = await db.tradeCashPayment.findMany({
    where: {
      recipientId: sellerId,
      status: PaymentStatus.completed,
      amount: { gt: 0 },
      payoutTransfers: { none: {} },
      trade: { isTest: false },
    },
    select: {
      tradeId: true,
      payment: { select: { id: true, isTest: true } },
    },
  });
  for (const tcp of tradeCash) {
    if (tcp.payment?.isTest) continue;
    if (!tcp.payment) return true;
    const refunded = await db.refundAttempt.count({
      where: {
        paymentId: tcp.payment.id,
        tradeId: tcp.tradeId,
        status: RefundAttemptStatus.succeeded,
      },
    });
    if (refunded === 0) return true;
  }
  return false;
}

/** Süpürmenin dokunduğu tablolar. */
export type DeletedSellerBankAccountDb = UnsettledPayoutDb &
  Pick<Prisma.TransactionClient, "sellerBankAccount">;

/** Sayfa boyu: adaylar id sırasıyla, sayfa sayfa okunur (borçlu kalan satırlar
 * sonrakileri aç bırakmasın diye tur bütün adayları dolaşır). */
const DELETED_SELLER_BANK_ACCOUNT_PAGE = 200;

/**
 * Hesap silmede, ödenecek hakediş yüzünden KORUNAN banka hesaplarını
 * (`purgeSellerDataForAccountDeletion`) para kapanınca siler (KVKK). Günlük
 * payout cron'undan çağrılır; idempotent ve yeniden çalıştırılabilir: silinmiş
 * hesabın satırı ya borç kalktığı için silinir ya da bir sonraki tura kalır.
 *
 * @returns silinen banka hesabı sayısı
 */
export async function purgeSettledBankAccountsOfDeletedSellers(
  db: DeletedSellerBankAccountDb,
): Promise<number> {
  let purged = 0;
  let afterId: string | undefined;
  for (;;) {
    const page = await db.sellerBankAccount.findMany({
      where: {
        user: { deletedAt: { not: null } },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: { id: true, userId: true },
      orderBy: { id: "asc" },
      take: DELETED_SELLER_BANK_ACCOUNT_PAGE,
    });
    for (const account of page) {
      if (await hasUnsettledPayout(db, account.userId)) continue;
      const { count } = await db.sellerBankAccount.deleteMany({
        where: { id: account.id },
      });
      purged += count;
    }
    if (page.length < DELETED_SELLER_BANK_ACCOUNT_PAGE) return purged;
    afterId = page[page.length - 1].id;
  }
}
