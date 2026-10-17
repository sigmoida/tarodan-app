import {
  CONSENT_DOCUMENT_KEYS,
  CONSENT_DOCUMENTS,
  type ConsentDocumentKey,
  type PendingConsent,
} from "@tarodan/types";
import { isEmbedPath } from "./embed";

/**
 * Yeniden-onay kapısının saf kuralları (bileşen yalnız çizer).
 *
 * Yasal metinlerin sayfaları kapıdan muaftır: üye onaylayacağı metni aynı
 * sekmede okuyabilmeli. Liste belge kataloğundan türetilir — yeni bir belge
 * yolu eklendiğinde burası ayrıca güncellenmez.
 */
export const CONSENT_GATE_EXEMPT_PATHS: readonly string[] = [
  ...new Set(
    CONSENT_DOCUMENT_KEYS.map((key) => CONSENT_DOCUMENTS[key].path).filter(
      (path): path is string => path !== null,
    ),
  ),
];

/**
 * `/app/**` (mobil WebView'in yasal metin sayfaları) de muaftır: oturum çerezi
 * WebView ile paylaşılsa bile üye metni okurken onay/kimlik penceresi çıkmaz.
 * Embed düzeni kapıyı zaten bağlamaz; bu, kuralın tek yerde de doğru kalması
 * içindir.
 */
export function isConsentGateExempt(pathname: string): boolean {
  return (
    isEmbedPath(pathname) ||
    CONSENT_GATE_EXEMPT_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  );
}

/** Kapı ancak bekleyen belgelerin HEPSİ işaretlenince gönderilebilir. */
export function canSubmitConsents(
  pending: readonly PendingConsent[],
  checked: ReadonlySet<ConsentDocumentKey>,
): boolean {
  return pending.length > 0 && pending.every((p) => checked.has(p.document));
}
