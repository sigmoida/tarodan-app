import { OrderStatus, type Prisma } from "@prisma/client";

/**
 * Bir ödemenin ait olduğu siparişler: tekil sipariş (`orderId`) ya da sepetin
 * bütün siparişleri (`checkoutGroupId`). Takas nakit ödemesinde ikisi de
 * boştur — sipariş yoktur.
 */
export interface PaymentOrderTarget {
  orderId: string | null;
  checkoutGroupId: string | null;
}

/**
 * ÇEKİM ↔ İPTAL KARŞILIKLI DIŞLAMASI — sipariş satırı kilidi üzerinden.
 *
 * Ödenmemiş siparişi kapatan her yol satırı yazar (admin iptali ve 24s
 * süpürmesi `FOR UPDATE` alır, alıcı iptali `version` koşullu UPDATE yapar).
 * Çekim claim'i ve ödeme callback'i aynı satırları kilitlemezse ikisi
 * birbirinin arasına girer:
 * - claim siparişi `pending_payment` okur, iptal commit eder, claim yine de
 *   başarır → PayTR iptal edilmiş siparişi çeker (taraflara "ödeme
 *   alınmadı" denmişken);
 * - callback siparişi `pending_payment` okur, iptal commit eder, callback
 *   `preparing` yazar → iptal edilmiş sipariş sessizce canlanır.
 *
 * Kilit sırası para yollarıyla aynıdır: ÖNCE ödeme satırı, SONRA sipariş
 * satırları (iade sonlandırması da ödeme → sipariş sırasıyla kilitler);
 * sepette siparişler id sırasıyla kilitlenir.
 */

/**
 * Claim için: siparişleri `FOR SHARE` ile kilitler ve hâlâ ödenebilir mi
 * (hepsi `pending_payment`) döner. Kilit commit'e kadar tutulur; eşzamanlı
 * bir iptal ya bekler (sonra canlı çekimi görüp durur) ya da önce commit
 * etmiştir (burada `cancelled` okunur, claim reddedilir). Siparişi olmayan
 * hedef (takas) için true.
 */
export async function lockOrdersStillPayable(
  tx: Prisma.TransactionClient,
  target: PaymentOrderTarget,
): Promise<boolean> {
  let rows: { status: string }[];
  if (target.orderId) {
    rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM orders
      WHERE id = ${target.orderId}
      FOR SHARE
    `;
  } else if (target.checkoutGroupId) {
    rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM orders
      WHERE checkout_group_id = ${target.checkoutGroupId}
      ORDER BY id
      FOR SHARE
    `;
  } else {
    return true;
  }
  return (
    rows.length > 0 &&
    rows.every((row) => row.status === OrderStatus.pending_payment)
  );
}

/**
 * Callback için: siparişleri `FOR UPDATE` ile kilitler. Ödeme satırı claim
 * edildikten SONRA, sipariş durumu okunmadan ÖNCE çağrılır; böylece okunan
 * durum, kilit bırakılana dek yazılacak durumla aynıdır (araya iptal giremez).
 */
export async function lockPaymentOrders(
  tx: Prisma.TransactionClient,
  target: PaymentOrderTarget,
): Promise<void> {
  if (target.orderId) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${target.orderId} FOR UPDATE`;
  } else if (target.checkoutGroupId) {
    await tx.$queryRaw`
      SELECT id FROM orders
      WHERE checkout_group_id = ${target.checkoutGroupId}
      ORDER BY id
      FOR UPDATE
    `;
  }
}
