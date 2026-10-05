import { isLiveProduction } from "./environment";

/**
 * SMS doğrulama yapılandırması.
 *
 * `SMS_FIXED_VERIFICATION_CODE` UAT içindir: staging'de test kullanıcıları gerçek
 * bir telefona sahip olmadan "kaydederken doğrula" akışını tamamlayabilsin diye
 * telefon doğrulama kodu sabitlenir ve SMS GÖNDERİLMEZ. Kodun biçimi doğrulama
 * DTO'suyla aynıdır (6 rakam).
 *
 * İki kat kilit: `env.validation.ts` canlı dağıtımda (APP_ENV=production) değer
 * verilmişse açılışı durdurur; bu erişimci de canlıda değeri yok sayar — bir
 * doğrulama atlatılsa bile canlıda kimse sabit kodla telefon doğrulayamaz.
 *
 * ⚠ Anahtar `env.validation.ts`'te bildirilmiştir; bildirilmeseydi `.env`
 * dosyasından hiç ulaşmazdı (bkz. oradaki CAVEAT).
 */

/** Doğrulama DTO'sunun kabul ettiği kod biçimi — sabit kod da buna uymalı. */
export const SMS_VERIFICATION_CODE_PATTERN = /^\d{6}$/;

/** Sabit kod modu açıksa kodu, değilse `null` döner. */
export function smsFixedVerificationCode(): string | null {
  const raw = process.env.SMS_FIXED_VERIFICATION_CODE?.trim();
  if (!raw || !SMS_VERIFICATION_CODE_PATTERN.test(raw)) return null;
  if (isLiveProduction()) return null;
  return raw;
}
