import { localizedPayloadOf } from "../../i18n/localized-message";
import {
  NetsisRequestException,
  classifyNetsisError,
  isNetsisPreSendFailure,
} from "../../netsis";
import { NetsisAccountingMappingError } from "./netsis-accounting-mapper";

/**
 * Muhasebe senkronunun yeniden-deneme politikası — SAF, tek yer.
 *
 * Fatura teslimatıyla aynı ilke (ağ bütçe tüketmez, yapılandırma bütçeyi
 * hemen bitirir) artı bir fark: tahsilat/havale yazmanın Netsis'te
 * idempotency anahtarı YOK. Gönderildikten sonra sonucu bilinmeyen bir çağrıyı
 * (zaman aşımı, kopma, 5xx, tanınmayan başarılı yanıt) körlemesine yeniden
 * denemek ikinci bir muhasebe kaydı demektir; o yüzden bu durumda satır
 * insana bırakılır (alarm + izleme anahtarı + elle eşleştirme).
 */

/** Bütçe tüketen deneme üst sınırı (fatura teslimatıyla aynı). */
export const NETSIS_SYNC_MAX_ATTEMPTS = 8;

/**
 * Gönderim kirası. Bu süreden eski `processing` satırının sahibi çökmüş sayılır
 * (fatura teslimatının kirasıyla aynı mantık).
 */
export const NETSIS_SYNC_LEASE_MS = 10 * 60 * 1000;

export type NetsisSyncFailureOutcome =
  /** Netsis'e ulaşılmadı / geçici kapalı — bütçe tüketmez, `pending`. */
  | "retry"
  /** Netsis reddetti ya da veri hatası — bir deneme tüketir, `failed`. */
  | "attempt"
  /** Yapılandırma / kimlik hatası — yeniden denemek değiştirmez, bütçe biter. */
  | "exhaust"
  /** Gönderildi ama sonucu bilinmiyor — çift kayıt riski, insana bırakılır. */
  | "unknown";

/** Hiç istek atılmadan düşen, kendiliğinden geçen durumlar. */
const TRANSIENT_KEYS = new Set([
  "server.netsis.sessionBusy",
  "server.netsis.disabled",
]);

/**
 * @param phase `prepare`: kaynak/fiş okuma, eşleme — henüz yazma yok.
 *              `send`: yazma çağrısı (createCollection / createBankTransfer).
 */
export function netsisSyncFailureOutcome(
  error: unknown,
  phase: "prepare" | "send",
): NetsisSyncFailureOutcome {
  if (error instanceof NetsisAccountingMappingError) return "exhaust";
  const key = localizedPayloadOf(error)?.i18nKey;
  if (key && TRANSIENT_KEYS.has(key)) return "retry";
  if (key === "server.netsis.notConfigured") return "exhaust";
  if (isNetsisPreSendFailure(error)) return "retry";

  const kind = classifyNetsisError(error);
  if (phase === "prepare") {
    if (kind === "network") return "retry";
    if (kind === "auth" || kind === "configuration") return "exhaust";
    return "attempt";
  }

  // Netsis YANIT verdi (HTTP durumu var) ve reddetti: kayıt oluşmadı.
  const answered =
    error instanceof NetsisRequestException && error.upstreamStatus !== null;
  if (answered && (kind === "auth" || kind === "configuration")) {
    return "exhaust";
  }
  if (answered && kind === "validation") return "attempt";
  // "Zaten var" (önceki deneme yazmış olabilir), zaman aşımı, kopma, 5xx,
  // tanınmayan yanıt şekli: sonuç bilinmiyor.
  return "unknown";
}
