import { OrderStatus } from "@prisma/client";
import { OFFER_ADMIN_CANCEL_PREFIX } from "../../trade/helpers/trade-cancel-reasons";

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

/** "Yönetici tarafından iptal edildi[: <etiket>]" — `adminCancelReasonText`in yazdığı metin. */
function hasAdminCancelPrefix(reason: string): boolean {
  return (
    reason === OFFER_ADMIN_CANCEL_PREFIX ||
    reason.startsWith(`${OFFER_ADMIN_CANCEL_PREFIX}:`)
  );
}

/**
 * Ham `cancelReason`'ı stabil bir kategoriye eşler; istemciler (web, mobil) bu
 * kategoriye göre kullanıcı dostu mesaj gösterir. Tanınmayan serbest metinler
 * `other` kalır ve ham haliyle gösterilir. Yalnız iptal edilmiş siparişler için
 * anlamlıdır; aksi halde null.
 *
 * Yönetici iptali iki biçimde yazılmıştır: güncel "Yönetici tarafından iptal
 * edildi: <etiket>" (admin-cancel-reason.ts) ve eski "Admin tarafından iptal
 * edildi" / "Admin force-cancel …". Çıktı sözlüğü `coupon-restore-policy.ts`
 * ile paylaşılır (alıcı kusuru kategorileri).
 */
export function deriveOrderCancelCategory(order: {
  status: OrderStatus;
  cancelReason?: string | null;
}): string | null {
  if (order.status !== OrderStatus.cancelled) return null;
  const reason = (order.cancelReason ?? "").trim();
  if (!reason) return "buyer_cancelled";
  if (reason === ORDER_CANCEL_REASON.paymentWindowExpired)
    return "payment_timeout";
  if (reason === ORDER_CANCEL_REASON.sellerShipDeadlineExpired)
    return "seller_no_ship";
  // Serbest metin eşleşmelerinden ÖNCE: etiket "stok" ya da "takas" geçebilir
  // ve sabit önek, o kelimelerden daha güçlü bir kanıttır.
  if (hasAdminCancelPrefix(reason)) return "admin";
  if (reason.includes("Stok tüken")) return "stockout";
  if (reason.includes("takas")) return "trade_reserved";
  if (reason === ORDER_CANCEL_REASON.replacedByNewCheckout)
    return "bulk_replaced";
  if (reason === "Alıcı lehine iptal edildi") return "admin_buyer_favor";
  if (
    reason === "Admin tarafından iptal edildi" ||
    reason.startsWith("Admin force-cancel")
  )
    return "admin";
  return "other";
}
