import {
  NetsisRequestException,
  netsisSnippet,
} from "../http/netsis-error";
import type { NetsisPassthrough, NetsisRawRecord } from "./netsis.types";

/**
 * Netsis yanıtlarını daraltan küçük yardımcılar. Yanıt şekilleri henüz
 * doğrulanmadığı için (VERIFY) beklenmeyen bir şekil sessizce `undefined`
 * alanlara dönüşmez: `unknown` sınıfında, gövdeden bir parçayla patlar.
 */

function unexpectedShape(what: string, data: unknown): NetsisRequestException {
  let preview: string;
  try {
    preview = netsisSnippet(JSON.stringify(data) ?? String(data));
  } catch {
    preview = typeof data;
  }
  return new NetsisRequestException(
    "unknown",
    null,
    `unexpected ${what}: ${preview}`,
  );
}

export function isNetsisRecord(value: unknown): value is NetsisRawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tek kayıt bekleyen uçlar. */
export function asNetsisRecord(data: unknown): NetsisRawRecord {
  if (isNetsisRecord(data)) return data;
  throw unexpectedShape("record", data);
}

/**
 * Yazma uçlarının (POST/PUT) yanıtı: kaydın Netsis'teki son hâli. VERIFY:
 * bazı uçlar boş gövde dönebilir — o zaman gönderilen model döner.
 */
export function writtenNetsisRecord<T extends NetsisPassthrough>(
  data: unknown,
  sent: T,
): T {
  return data === null ? sent : (asNetsisRecord(data) as T);
}

/** Liste bekleyen uçlar; boş gövde boş liste sayılır. */
export function asNetsisRecordList(data: unknown): NetsisRawRecord[] {
  if (data === null || data === undefined || data === "") return [];
  if (Array.isArray(data) && data.every(isNetsisRecord)) return data;
  throw unexpectedShape("list", data);
}

/**
 * Tek bir metin değeri döndüren uçlar (yeni numara, transId, HTML): yanıt düz
 * string/number olabilir ya da bilinen alan adlarından birini taşıyan bir
 * nesne (VERIFY: hangisi olduğu uç başına sabitlenecek).
 */
export function readNetsisScalar(
  data: unknown,
  fieldCandidates: readonly string[],
): string {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data === "number" && Number.isFinite(data)) return String(data);
  if (isNetsisRecord(data)) {
    for (const field of fieldCandidates) {
      const value = data[field];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
  }
  throw unexpectedShape(`scalar (${fieldCandidates.join("|")})`, data);
}

/** "Kayıt bulunamadı" — 404 ya da başarısız zarftaki TR/EN mesaj (VERIFY). */
const NOT_FOUND_PATTERN = /bulunamad|kayıt yok|not found|does not exist/i;

export function isNetsisNotFound(error: unknown): boolean {
  return (
    error instanceof NetsisRequestException &&
    (error.upstreamStatus === 404 || NOT_FOUND_PATTERN.test(error.detail))
  );
}

/**
 * Kod/ID ile arama: kaydın yokluğu bir hata değil, `null`. Boş gövde de
 * `null` sayılır; diğer her hata olduğu gibi yükselir.
 */
export async function nullIfNetsisNotFound(
  call: Promise<unknown>,
): Promise<NetsisRawRecord | null> {
  try {
    const data = await call;
    if (data === null || data === undefined || data === "") return null;
    return asNetsisRecord(data);
  } catch (error: unknown) {
    if (isNetsisNotFound(error)) return null;
    throw error;
  }
}

/** URL yol parçası — kodlar `/`, boşluk ya da Türkçe karakter içerebilir. */
export function netsisPathSegment(value: string): string {
  return encodeURIComponent(value);
}
