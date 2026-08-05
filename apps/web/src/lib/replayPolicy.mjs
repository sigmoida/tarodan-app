import { isPaymentPath } from "./cspPolicy.mjs";

/**
 * Sentry Session Replay'in nerede çalışacağı — tek kaynak.
 *
 * NEDEN: PayTR Direkt API'de kart numarası/CVV bizim sayfamızda toplanır, bu da
 * ödeme sayfasını PCI DSS 4.0 6.4.3 kapsamına sokar: sayfadaki HER script
 * envanterlenmeli ve gerekçelendirilmelidir. Replay varsayılan maskelemeyle
 * (`maskAllText`/`maskAllInputs`) kart verisini kaydetmez, ama DOM kaydeden bir
 * script'i kart sayfasında tutmanın savunulabilir bir gerekçesi yok — kaydı hiç
 * başlatmamak hem yüzeyi hem de denetim yükünü kaldırır.
 *
 * İKİ KATMAN: (1) init anında örnekleme oranları sıfırlanır (kullanıcı doğrudan
 * ödeme URL'ine girerse replay HİÇ kurulmaz), (2) SPA gezinmesiyle sayfaya
 * sonradan girilirse rota koruması çalışan kaydı durdurur.
 */

/** Yapılandırılmış varsayılan örnekleme (ödeme dışı sayfalar). */
export const DEFAULT_SESSION_SAMPLE_RATE = 0.1;
export const DEFAULT_ON_ERROR_SAMPLE_RATE = 1;

/**
 * Bu yolda replay kaydı yapılabilir mi? Pathname bilinmiyorsa (sunucu) evet:
 * kayıt zaten yalnız tarayıcıda başlar, kart sayfası korumasını rota guard'ı üstlenir.
 */
export function shouldRecordReplay(pathname) {
  if (typeof pathname !== "string") return true;
  return !isPaymentPath(pathname);
}

/** Sentry.init'e verilecek örnekleme oranları. */
export function replaySampleRates(pathname) {
  return shouldRecordReplay(pathname)
    ? {
        replaysSessionSampleRate: DEFAULT_SESSION_SAMPLE_RATE,
        replaysOnErrorSampleRate: DEFAULT_ON_ERROR_SAMPLE_RATE,
      }
    : { replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 };
}
