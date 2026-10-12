import { HttpException, HttpStatus } from "@nestjs/common";
import type { MessageKey } from "@tarodan/i18n";
import { i18nMessage } from "../../i18n/localized-message";

/**
 * Netsis hatalarının TEK sınıflandırması.
 *
 * Çağıran (ileride faturalama sağlayıcısı) yeniden denemeye, kalıcı hata
 * saymaya ya da "zaten kesilmiş" diye uzlaştırmaya buna göre karar verir:
 *  - `network`       geçici: bağlantı/timeout/502-504 — yeniden dene
 *  - `auth`          kimlik/oturum reddi — oturum zaten bir kez yenilendi
 *  - `validation`    Netsis isteği iş kuralı ya da veri yüzünden reddetti
 *  - `conflict`      kayıt/numara zaten var — idempotent yeniden denemede
 *                    "önceki deneme başarılı olmuş" demektir
 *  - `configuration` yanlış adres/sürüm, eksik ayar, sertifika — insan işi
 *  - `unknown`       sınıflanamayan 5xx ya da beklenmeyen yanıt şekli
 */
export type NetsisErrorKind =
  | "network"
  | "auth"
  | "validation"
  | "conflict"
  | "configuration"
  | "unknown";

const MESSAGE_KEYS: Record<NetsisErrorKind, MessageKey> = {
  network: "server.netsis.error.network",
  auth: "server.netsis.error.auth",
  validation: "server.netsis.error.validation",
  conflict: "server.netsis.error.conflict",
  configuration: "server.netsis.error.configuration",
  unknown: "server.netsis.error.unknown",
};

/**
 * Netsis'ten (ya da ona ulaşamamaktan) doğan her hata. `detail` yalnız log
 * içindir: yanıt gövdesinden kısaltılmış bir parça, ASLA istek gövdesi (token
 * isteği kimlik bilgisi taşır).
 */
export class NetsisRequestException extends HttpException {
  constructor(
    readonly kind: NetsisErrorKind,
    /** Netsis'in HTTP durumu; ağa hiç çıkılamadıysa `null`. */
    readonly upstreamStatus: number | null,
    readonly detail: string,
    messageKey: MessageKey = MESSAGE_KEYS[kind],
    cause?: unknown,
  ) {
    super(
      i18nMessage(messageKey),
      kind === "network" ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
      cause === undefined ? undefined : { cause },
    );
  }
}

/** Netsis'in döndürdüğü başarısız yanıt (HTTP ≥ 400 ya da başarısız zarf). */
export interface NetsisUpstreamFailure {
  status: number;
  body: string;
}

/** "Bu numara/kayıt zaten var" — TR ve EN Netsis/SQL Server mesajları. */
const CONFLICT_PATTERN =
  /duplicate|zaten|already exists|mükerrer|daha önce (kaydedil|kullanıl|oluşturul|kesil)|unique (key|constraint|index)|primary key/i;
/** Token ucu standart OAuth hatası ya da TR kimlik mesajları. */
const AUTH_PATTERN =
  /invalid_grant|invalid_client|unauthori[sz]ed|yetkisiz|kullanıcı adı|şifre(si)? (hatalı|yanlış)|parola/i;

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** Müşteri sunucusunda öz-imzalı/bozuk sertifika: yeniden denemek çözmez. */
const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/**
 * Netsis'in döndürdüğü bir başarısızlığı sınıflar. `status` 200 olabilir:
 * NetOpenX iş hatalarını `IsSuccessful: false` zarfıyla da bildirir (VERIFY) —
 * o durum 4xx gibi değerlendirilir.
 */
export function classifyNetsisResponse(
  status: number,
  body: string,
): NetsisErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 502 || status === 503 || status === 504) return "network";
  if (status >= 500) return "unknown";
  if (status === 408 || status === 429) return "network";
  if (status === 409 || CONFLICT_PATTERN.test(body)) return "conflict";
  if (AUTH_PATTERN.test(body)) return "auth";
  // Yanlış taban adres/sürüm ya da REST modülü kurulu değil. Kayıt düzeyindeki
  // "bulunamadı" istemcilerde ayrıca `null`'a çevrilir (netsis-response.helper).
  if (status === 404 || status === 405) return "configuration";
  return "validation";
}

function isUpstreamFailure(value: unknown): value is NetsisUpstreamFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as NetsisUpstreamFailure).status === "number" &&
    typeof (value as NetsisUpstreamFailure).body === "string"
  );
}

/** `err.code` ya da undici'nin sardığı `err.cause.code`. */
function errorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && typeof current === "object" && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Herhangi bir hatayı sınıflar: zaten sınıflanmış bir `NetsisRequestException`,
 * Netsis'in başarısız yanıtı ya da fetch/undici/Node ağ hatası.
 */
export function classifyNetsisError(error: unknown): NetsisErrorKind {
  if (error instanceof NetsisRequestException) return error.kind;
  if (isUpstreamFailure(error)) {
    return classifyNetsisResponse(error.status, error.body);
  }
  const code = errorCode(error);
  if (code && TLS_CODES.has(code)) return "configuration";
  if (code && NETWORK_CODES.has(code)) return "network";
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "network";
  }
  // undici, nedeni kodsuz kalan bağlantı hatalarını "fetch failed" diye atar.
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return "network";
  }
  return "unknown";
}

/** Log'a güvenli kısa parça: satır sonları düzleşir, 300 karakterde kesilir. */
export function netsisSnippet(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 300);
}
