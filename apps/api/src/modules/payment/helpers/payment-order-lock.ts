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
 * KİLİT SIRASI — hem ödeme hem sipariş satırı kilitleyen her yolda ÖNCE
 * ödeme, SONRA sipariş (sepette ikisi de id sırasıyla):
 * - claim: ödeme FOR UPDATE → siparişler FOR SHARE;
 * - callback: ödeme CAS (claimPaymentCompleted) → siparişler FOR UPDATE;
 * - iade sonlandırması: ödeme FOR UPDATE → sipariş yazımı;
 * - 24s süpürmesi: ödeme(ler) FOR UPDATE (`lockOrderPaymentRows`) →
 *   sipariş FOR UPDATE → ödeme yazımı.
 * Yalnız sipariş kilitleyen iptaller (alıcı / yönetici iptali, hazırlama
 * süresi süpürmesi) ödeme satırını KİLİTLEMEZ, yalnız okur; bekledikleri tek
 * kilit sipariş kilididir, döngü oluşmaz.
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
 * Siparişten başlayan bir yol (24s süpürmesi) siparişin ödeme satır(lar)ına
 * dokunacaksa: ÖNCE bunları kilitler — siparişin kendi ödemesi ve (sepette)
 * grubunun ödemesi, id sırasıyla. Böylece süpürme de ödeme → sipariş
 * sırasına uyar; claim (ödeme → sipariş) ile ters sırada kilitleyip
 * kilitlenmeye (deadlock) girmez.
 */
export async function lockOrderPaymentRows(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT p.id FROM payments p
    WHERE p.order_id = ${orderId}
       OR p.checkout_group_id = (
         SELECT o.checkout_group_id FROM orders o WHERE o.id = ${orderId}
       )
    ORDER BY p.id
    FOR UPDATE OF p
  `;
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
