/**
 * Süreler ve Kurallar'ın env GERİ DÜŞÜŞÜ — eski süre env'lerinin tek okuma noktası.
 *
 * İş süreleri artık PlatformSetting'ten okunur (`common/timing-rules`); env
 * değişkenleri yalnız admin bir değer kaydedene kadar geçerli olan ilk kurulum
 * değeridir. Okuma burada toplanır ki hangi anahtarın hangi kayda düştüğü tek
 * listeden (`TIMING_RULES[id].envKey`) görülsün ve modüllerde ham
 * `process.env` okuması kalmasın (§12).
 *
 * `ConfigService` erişilebilen servisler onu verir (testler env'i oradan
 * değiştirir, doğrulanmış katman korunur); DI'ın ulaşmadığı yerlerde bu dosyadaki
 * `process.env` okuyucusu kullanılır. İkisi aynı değeri döndürür: doğrulama
 * şemasında bildirilmiş anahtarlar ConfigModule tarafından `process.env`e geri
 * yazılır, bildirilmemişler zaten yalnız oradadır.
 *
 * DİKKAT: buradaki anahtarların çoğu `env.validation.ts`te bildirilmemiştir ve
 * yalnız gerçek ortam değişkeni olarak verildiğinde etkilidir (§15 "Known,
 * undecided"). Bu davranış bilerek korunur: bildirmek, bir `.env` dosyasında
 * duran ama bugün etkisiz olan değeri deploy'da etkin kılardı.
 */

/** Env okuyabilen minimum yüzey — `ConfigService` ya da test sahtesi. */
export interface TimingEnvReader {
  get(key: string): string | undefined;
}

/** DI'ın ulaşmadığı yardımcılar için `process.env` okuyucusu. */
export const processEnvTimingReader: TimingEnvReader = {
  get: (key) => process.env[key],
};
