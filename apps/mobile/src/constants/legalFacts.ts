/**
 * Statik bilgi / legal sayfalarının ortak kullandığı kanonik politika ve iletişim
 * bilgileri (faq, help, refund-policy, returns-exchanges, contact, distance-sales,
 * seller-agreement, buyer-protection, platform-hizmet-bedeli, terms, privacy ...).
 *
 * Bu değerler eskiden 10+ sayfaya elle kopyalanıyor ve birbiriyle çelişiyordu
 * (iade süresi 7 vs 14 gün, komisyon %5/%3/%2, her sayfada farklı sahte telefon).
 * Tek doğruluk kaynağı burasıdır; sayfalar bu sabitleri import eder, böylece değer
 * tekrar birbirinden ayrışamaz.
 *
 * Doğrulanmış kaynaklar:
 * - İade talep penceresi 14 gün → backend COOLING_OFF_DAYS (apps/api refund.service.ts).
 * - Komisyon DB-driven (CommissionRule), %5'ten başlar; sabit %3/%2 tier yoktur.
 * - Genel destek e-postası web ile birebir aynı: destek@tarodan.com.
 * - Gerçek bir destek telefonu henüz tanımlı değildir; tüm sayfalarda tutarlı
 *   placeholder gösterilir, gerçek numara gelince yalnızca burası güncellenir.
 */

// — İade süreleri (gün) —

/** Teslimden itibaren cayma / iade talebi süresi. Backend COOLING_OFF_DAYS = 14 ile eşleşir. */
export const RETURN_REQUEST_DAYS = 14;

/** İade ürünü satıcıya ulaştıktan sonra iade tutarının ödenme süresi. */
export const REFUND_PAYOUT_DAYS = 14;

/** Hasarlı / hatalı ürün için fotoğraflı bildirim süresi. */
export const DAMAGE_REPORT_DAYS = 3;

// — İletişim —

/** Genel destek e-postası (web ile aynı). */
export const SUPPORT_EMAIL = 'destek@tarodan.com';

/** Amaca özel posta kutuları — ayrı adreslerdir, çelişki değildir. */
export const COMPANY_INFO_EMAIL = 'info@tarodan.com';
export const LEGAL_EMAIL = 'legal@tarodan.com';
export const PRIVACY_EMAIL = 'privacy@tarodan.com';
export const SELLER_SUPPORT_EMAIL = 'seller-support@tarodan.com';
export const SECURITY_EMAIL = 'security@tarodan.com';
export const IP_EMAIL = 'ip@tarodan.com';

/**
 * Destek telefonu / WhatsApp. Gerçek hat henüz yok; tüm sayfalarda TEK ve tutarlı
 * placeholder gösterilir. Gerçek numara gelince yalnızca buradan güncellenir.
 */
export const SUPPORT_PHONE = '0850 XXX XX XX';
export const SUPPORT_WHATSAPP = '+90 5XX XXX XX XX';

// — Komisyon —

/**
 * Komisyonun kullanıcıya gösterilen açıklaması. Canlı komisyon DB-driven
 * (CommissionRule) olduğundan ve %5'ten başlayıp kategoriye / üyeliğe göre
 * değiştiğinden, sabit %5/%3/%2 tier metni yerine bu dürüst, aralık tabanlı
 * ifade kullanılır.
 */
export const COMMISSION_SUMMARY =
  "Satış tutarı üzerinden %5'ten başlayan platform komisyonu kesilir. " +
  "Komisyon oranı ürün kategorisine göre değişebilir ve Premium/Business üyelikte düşer. " +
  "Net oran satış sırasında gösterilir.";
