/**
 * Sipariş iptal gerekçeleri için TEK kaynak. `Order.cancelReason` serbest
 * metin kolondur; otomatik yollar buradaki sabitleri yazar ki müşteri
 * ekranındaki kategori (`deriveCancelCategory`), stok-geri-geldi bildirimi ve
 * admin "İptal & İade" ekranının "Süresi Dolan" gerekçesi aynı metni güvenle
 * eşleştirebilsin (takas/teklif karşılığı: `trade-cancel-reasons.ts`).
 *
 * METİNLER DEĞİŞTİRİLMEZ: geçmiş satırlar bu literallerle yazıldı ve
 * `20260922100000_cancellation_actor` göçünün geriye dönük doldurması onları
 * birebir eşleştirir. Yeni bir gerekçe gerekiyorsa yeni anahtar eklenir.
 * Kullanıcı kaynaklı iptallerde istemcinin gönderdiği metin aynen saklanır.
 */
export const ORDER_CANCEL_REASON = {
  /** Alıcı ödenmemiş siparişini gerekçe yazmadan iptal etti. */
  buyerCancelled: "Alıcı tarafından iptal edildi",
  /** 24 saatlik ödeme penceresi doldu (kill-switch cron'u). */
  paymentWindowExpired: "Ödeme süresi (24 saat) doldu",
  /** Satıcı hazırlama süresi içinde kargoya vermedi (otomatik iptal cron'u). */
  sellerShipDeadlineExpired:
    "Satıcı belirlenen süre içinde kargoya vermediği için otomatik iptal edildi",
  /** Ödeme alındı ama fiziksel stok sipariş adedini karşılamadı. */
  oversoldAfterPayment:
    "Stok tükendi: ödeme sonrası mevcut stok sipariş adedini karşılamadı",
  /** Başka bir satış son adedi tüketti; bekleyen ödemesiz siparişler kapandı. */
  stockDepleted: "Stok tükendi",
  /** Kabul edilen bir takas son adedi ayırdı. */
  stockReservedForTrade: "Stok takas icin ayrildi",
  /** Aynı alıcı aynı ürün için yeni sepet ödemesi başlattı; eskisi kapandı. */
  replacedByNewCheckout: "Yeni toplu sipariş ile değiştirildi",
} as const;

/**
 * SÜRE DOLUMU iptalleri — admin ekranı bunları "Süresi Dolan" gerekçesiyle
 * "Tarodan iptali" sekmesinde gösterir. Aktör (`system`) tek başına yetmez:
 * stok kaskadı ve ödeme hatası da sistem iptalidir ama süre dolumu değildir.
 * Ek kolon yerine gerekçe sabiti: bu yolların her biri zaten sabit bir metin
 * yazıyor ve metin geçmiş satırlarda da mevcut.
 */
export const ORDER_EXPIRY_CANCEL_REASONS: readonly string[] = [
  ORDER_CANCEL_REASON.paymentWindowExpired,
  ORDER_CANCEL_REASON.sellerShipDeadlineExpired,
];

export function isOrderExpiryCancelReason(
  reason: string | null | undefined,
): boolean {
  return reason != null && ORDER_EXPIRY_CANCEL_REASONS.includes(reason);
}
