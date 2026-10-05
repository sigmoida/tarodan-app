import {
  resolveTimingValue,
  type TimingSettingReader,
} from "../../../common/timing-rules";

/**
 * Faz 9.2: Ödeme sabitleri + config anahtarları için tek referans. Kod tabanında
 * dağınık "magic number"lar (para epsilon 0.01, pencere süreleri) ve env anahtarları
 * vardı; bu dosya tek kaynak olarak toplar.
 *
 * İŞ SÜRELERİ BURADA DEĞİL: iade penceresi, payout grace, hazırlık süresi, iade
 * drop-off/inceleme/bekleme süreleri, ödeme fail/rezervasyon pencereleri ve
 * sipariş ödeme penceresi Süreler ve Kurallar kaydına (`@tarodan/types`
 * TIMING_RULES) taşındı; admin ekranından değişir, okuma
 * `common/timing-rules` üzerindendir. Eski env değişkenleri (RETURN_WINDOW_DAYS
 * vb.) yalnız ilk kurulum geri düşüşüdür.
 */

/**
 * Para karşılaştırma epsilon'u (kuruş yuvarlama toleransı). `>= X - MONEY_EPSILON` /
 * `> cap + MONEY_EPSILON` kalıplarında kullanılır. Tek yerden yönetilir ki tüm para
 * karşılaştırmaları tutarlı olsun.
 */
export const MONEY_EPSILON = 0.01;

/**
 * Teknik (iş kuralı olmayan) PayTR env anahtarları ve varsayılanları — belge
 * amaçlı tek referans. Bunlar bilinçli olarak env'de kalır: sağlayıcı
 * mutabakatının iç ayarlarıdır, admin'in değiştireceği politika değil.
 */
export const PAYMENT_CONFIG_KEYS = {
  /** PayTR reconcile tutar toleransı (TL). */
  RECONCILE_AMOUNT_TOLERANCE_TL: {
    key: "PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL",
    default: 0.05,
  },
  /** Orphan capture geriye-bakış (saat) — FLOW-M3. */
  ORPHAN_LOOKBACK_HOURS: {
    key: "PAYTR_ORPHAN_LOOKBACK_HOURS",
    default: 72,
    min: 1,
  },
} as const;

/**
 * Sipariş ödeme penceresinin bitişi: `from` + orderPaymentWindowHours (Süreler
 * ve Kurallar). Sipariş oluşunca `paymentExpiresAt` olarak damgalanır.
 * Checkout (direct/grup/misafir), teklif kabulü ve reaktivasyon AYNI değeri
 * kullanır — eskiden 6 ayrı noktada 24 sabitti.
 */
export async function paymentWindowEnd(
  db: TimingSettingReader,
  from: Date = new Date(),
): Promise<Date> {
  const hours = await resolveTimingValue(db, "orderPaymentWindowHours");
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
