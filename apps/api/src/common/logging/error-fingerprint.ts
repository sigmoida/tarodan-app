/**
 * Sentry gruplama (fingerprint) yardımcıları.
 *
 * `AppNestLogger.write` hatasız bir Error verilmediğinde `new Error(text)`
 * üretiyor; stack her zaman logger'da bittiği için Sentry ilgisiz hataları
 * tek issue'da topluyor (ör. "Cron 'refund-crons' FAILED" başlıklı issue
 * aslında "Cron 'sync-surat-tracking' FAILED" olaylarını da içeriyor;
 * `ELOGO_INVOICE_EXHAUSTED id=… no=TRD…` 100 farklı faturanın hepsini tek
 * issue'da eritiyor). Bu dosya mesajın değişken kısımlarını (uuid, PKG-/
 * ORD-/GRP-/RFD-/TKS-/TRD- kodları, süreler, e-posta, URL query string,
 * rakam içeren tırnaklı değerler) sabit bir şablona indirger, böylece aynı
 * *türden* hatalar aynı fingerprint'i, farklı türden hatalar (ör. farklı cron
 * job'ları) farklı fingerprint'i alır.
 */

const MAX_NORMALIZED_LENGTH = 160;

const DURATION_PATTERN = /\(\s*\d+(?:\.\d+)?\s*(?:ms|s|sn|dk|m|h)\s*\)/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// PKG-/ORD-/GRP-/RFD-/TKS-/TRD- işlem/varlık kodları: tire opsiyonel çünkü
// "no=TRD10023" gibi bitişik kullanımlar da var.
const ENTITY_CODE_PATTERN = /\b(PKG|ORD|GRP|RFD|TKS|TRD)-?\d+\b/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Sadece query string'i maskele; yol (path) tanısal değer taşıdığı için kalsın.
const URL_QUERY_PATTERN = /(\bhttps?:\/\/[^\s?]+)\?[^\s]*/gi;
// Tırnak içindeki değer bir rakam barındırıyorsa değişkendir (id, sayı, kod);
// yalnızca harflerden oluşan tırnaklı değerler (cron job adları gibi) sabit
// kalır ki "Cron 'refund-crons' FAILED" ile "Cron 'sync-surat-tracking'
// FAILED" ayrı fingerprint alsın.
const QUOTED_DYNAMIC_VALUE_PATTERN = /(['"])([^'"]*\d[^'"]*)\1/g;
// Önceki adımlarca yakalanmamış, tek başına duran uzun rakam dizileri.
const LONG_DIGIT_RUN_PATTERN = /\b\d{4,}\b/g;

/**
 * Bir hata mesajındaki değişken parçaları sabit yer tutucularla değiştirir.
 * Saf fonksiyon: aynı girdi her zaman aynı çıktıyı üretir.
 */
export function normalizeErrorMessage(message: string): string {
  let normalized = message
    .replace(DURATION_PATTERN, "(<dur>)")
    .replace(UUID_PATTERN, "<uuid>")
    .replace(ENTITY_CODE_PATTERN, "<code>")
    .replace(EMAIL_PATTERN, "<email>")
    .replace(URL_QUERY_PATTERN, "$1?<query>")
    .replace(QUOTED_DYNAMIC_VALUE_PATTERN, "$1<value>$1")
    .replace(LONG_DIGIT_RUN_PATTERN, "<num>")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length > MAX_NORMALIZED_LENGTH) {
    normalized = `${normalized.slice(0, MAX_NORMALIZED_LENGTH)}…`;
  }

  return normalized;
}

export interface ErrorFingerprintInput {
  /** Nest logger context'i, ör. "OrdersService" ya da "Nest". */
  context: string;
  /** Çağıran gerçek bir Error verdiyse onun `name`'i (ör. "PrismaClientKnownRequestError"). */
  errorName?: string;
  /** Loglanan/hata mesajı metni. */
  message: string;
}

/**
 * Sentry `scope.setFingerprint` ile uyumlu parça dizisi üretir. Logger'ın
 * kendi ürettiği (`new Error(text)`) hatalarda `errorName` verilmez; gerçek
 * bir Error verildiğinde onun adı da eklenir, çünkü aynı context+mesaj
 * kalıbından farklı hata sınıfları gelebilir.
 */
export function buildErrorFingerprint(input: ErrorFingerprintInput): string[] {
  const normalizedMessage = normalizeErrorMessage(input.message);
  return [input.context, input.errorName, normalizedMessage].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );
}

const FINGERPRINT_KEY = "__sentryFingerprint";

interface ErrorWithFingerprint extends Error {
  [FINGERPRINT_KEY]?: string[];
}

/** `error` üzerine hesaplanan fingerprint'i iliştirir (Sentry'ye kadar taşınsın diye). */
export function attachFingerprint(error: Error, fingerprint: string[]): void {
  (error as ErrorWithFingerprint)[FINGERPRINT_KEY] = fingerprint;
}

/** `attachFingerprint` ile eklenmiş fingerprint'i okur, yoksa `undefined` döner. */
export function readFingerprint(error: unknown): string[] | undefined {
  if (!(error instanceof Error)) return undefined;
  return (error as ErrorWithFingerprint)[FINGERPRINT_KEY];
}
