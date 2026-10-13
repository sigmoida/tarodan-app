/**
 * Teklif tabanı — TEK okuma noktası.
 *
 * `MIN_OFFER_PERCENTAGE`: teklifin, ilanın o anda geçerli satış fiyatına oranla
 * kabul edilen en düşük yüzdesi. İki yer aynı değeri kullanır: teklif servisi
 * (alt sınırı UYGULAR) ve herkese açık ayarlar (`GET /admin/settings/public` →
 * `min_offer_percentage`, istemciler formda GÖSTERİR). Mobil bu oranı %50 sabit
 * varsayıyordu; iki yer ayrı okusaydı env değişince istemci yanlış ipucu verirdi.
 *
 * DİKKAT: anahtar `env.validation.ts`te bildirilmemiştir ve yalnız gerçek ortam
 * değişkeni olarak verildiğinde etkilidir (apps/api/CLAUDE.md §15 "Known, undecided").
 * Bu davranış bilerek korunur: bildirmek, bir `.env` dosyasında duran ama bugün
 * etkisiz olan değeri deploy'da etkin kılardı.
 */

export const DEFAULT_MIN_OFFER_PERCENTAGE = 50;

/** Env okuyabilen minimum yüzey — `ConfigService` ya da test sahtesi. */
export interface MinOfferEnvReader {
  get(key: string): string | undefined;
}

/**
 * Geçerli değer 0–100 arası tam sayıdır. `0` GEÇERLİDİR ve "alt sınır yok"
 * demektir (eski davranış korunur: operatör tabanı bilerek kapatabilir).
 * Yalnız saf tam sayı metni (`/^\d+$/`) kabul edilir; "0.5", "0,5", "05abc", "-5",
 * boş ya da aralık dışı (>100) değer varsayılana (%50) düşer: eskiden `parseInt` NaN üretince alt sınır
 * karşılaştırması hiçbir teklifi reddetmiyordu.
 */
export function resolveMinOfferPercentage(env: MinOfferEnvReader): number {
  const raw = env.get("MIN_OFFER_PERCENTAGE")?.trim();
  // Yalnız saf tam sayı metni: parseInt "0.5"i 0, "05abc"yi 5 yapıp tabanı
  // sessizce kapatır/değiştirirdi. Başka her biçim varsayılana düşer.
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return DEFAULT_MIN_OFFER_PERCENTAGE;
  }
  const value = Number(raw);
  return value >= 0 && value <= 100 ? value : DEFAULT_MIN_OFFER_PERCENTAGE;
}
