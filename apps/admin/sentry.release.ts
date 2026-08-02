/**
 * Sentry ortak yapılandırma değerleri — client/server/edge dosyalarının tek
 * kaynağı (üçü birbirinden kaymasın diye).
 *
 * NEXT_PUBLIC_ öneki zorunlu: değerler tarayıcı paketine BUILD ZAMANINDA
 * gömülür, runtime env yeterli olmaz (Coolify'da build env olarak verilmeli).
 */

/**
 * Dağıtım sürümü. Olmadan "bu hata hangi deploy'la geldi" cevapsız kalır ve
 * Sentry'nin regresyon takibi (çözülen issue yeni sürümde tekrar açılırsa
 * uyarma) çalışmaz. Docker imajında `.git` yok, Sentry kendi tahmin edemez.
 */
export const sentryRelease =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || undefined;

/**
 * Ortam etiketi. `NODE_ENV`'e bağlanamaz: Dockerfile onu staging'de de
 * `production` yazar, dolayısıyla staging ile gerçek prod Sentry'de ayırt
 * edilemez ve staging test hataları prod alarmlarına karışırdı.
 */
export const sentryEnvironment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
  process.env.NODE_ENV ||
  "development";

/**
 * Örnekleme oranı ETİKETE değil gerçek çalışma kipine bakar: staging de bir
 * production build'idir; etiketi yüzünden tam örneklemeye geçilirse iz kotası
 * hızla tükenir.
 */
export const sentryTracesSampleRate =
  process.env.NODE_ENV === "production" ? 0.2 : 1.0;
