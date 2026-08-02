/**
 * Sentry dağıtım sürümü — client/server/edge yapılandırmalarının ortak kaynağı.
 *
 * Sürüm etiketi olmadan "bu hata hangi deploy'la geldi" sorusu cevapsız kalır
 * ve Sentry'nin regresyon takibi (çözülen bir issue yeni sürümde tekrar açılırsa
 * uyarma) çalışmaz. Docker imajında `.git` bulunmadığı için Sentry sürümü kendi
 * tahmin edemez; değer build zamanında env ile verilir.
 *
 * NEXT_PUBLIC_ öneki zorunlu: tarayıcı paketine gömülmesi gerekiyor.
 * Coolify commit sha'sını `SOURCE_COMMIT` olarak sunar — build arg olarak
 * NEXT_PUBLIC_SENTRY_RELEASE'e bağlanabilir.
 */
export const sentryRelease =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || undefined;
