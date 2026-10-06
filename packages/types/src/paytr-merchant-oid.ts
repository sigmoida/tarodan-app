/**
 * PayTR `merchant_oid` ("sipariş no") biçimi — TEK kaynak.
 *
 * PayTR her deneme için benzersiz ve YALNIZ harf/rakam bir id ister; bizim id'miz
 * iş numarasının tiresiz hâli + `T` + `Date.now()`'ın son 6 hanesidir:
 *
 *   GRP-DBN4NPYYTZ  →  GRPDBN4NPYYTZT790149
 *   TKS-K7X9M2QF3N  →  TRADETKSK7X9M2QF3NT790149   (takas: iş numarasına `TRADE-` eklenir)
 *
 * Üretim (`buildPaytrMerchantOid`) ve çözümleme (`parsePaytrMerchantOid`) aynı
 * dosyada durur: biçim değişirse ikisi birlikte değişir. Admin, PayTR panelinden
 * yapıştırılan id'den bizim siparişimize bu çözümleme ile ulaşır.
 */

/** Bir ödemenin hangi iş kaydına ait olduğu. */
export type PaytrOidSubject = "order" | "group" | "trade";

/**
 * Ödeme başlatırken `merchant_oid`'e taban olarak verilen iş numaraları.
 * `oidPrefix` tiresiz hâlin başıdır, `numberPrefix` iş numarasının önekidir
 * (bkz. API `code-prefixes.ts`; ikisinin uyumunu bir spec korur).
 */
export const PAYTR_OID_SUBJECTS = [
  { subject: "order", oidPrefix: "ORD", numberPrefix: "ORD" },
  { subject: "group", oidPrefix: "GRP", numberPrefix: "GRP" },
  { subject: "trade", oidPrefix: "TRADETKS", numberPrefix: "TKS" },
] as const satisfies readonly {
  subject: PaytrOidSubject;
  oidPrefix: string;
  numberPrefix: string;
}[];

/** `Date.now()`'ın son kaç hanesi deneme ekidir. */
const SUFFIX_DIGITS = 6;

/** Üretilen referans gövdesi 10 karakterdir; çakışmada +4'e çıkabilir. */
const BODY_PATTERN = /^[A-Z0-9]{10,14}$/;

const SUFFIX_PATTERN = new RegExp(`^(.+)T\\d{${SUFFIX_DIGITS}}$`);

/**
 * Bir iş numarasından PayTR `merchant_oid` üretir: tireler atılır, `T` + zaman
 * damgasının son 6 hanesi eklenir. Bu ifade iki ödeme başlatma noktasında
 * birebir aynıdır; davranışı değiştirmeyin.
 */
export function buildPaytrMerchantOid(
  baseNumber: string,
  now: number = Date.now(),
): string {
  const base = String(baseNumber).replace(/-/g, "");
  return `${base}T${now.toString().slice(-SUFFIX_DIGITS)}`;
}

/** Bir PayTR id'sinin işaret ettiği olası iş numarası. */
export interface PaytrOidCandidate {
  subject: PaytrOidSubject;
  /** Tireli iş numarası (ORD-…, GRP-…, TKS-…). */
  number: string;
}

export interface ParsedPaytrOid {
  /** Normalleştirilmiş (kırpılmış, büyük harf) PayTR id'si. */
  oid: string;
  candidates: PaytrOidCandidate[];
}

/**
 * Yapıştırılan metin bir PayTR id'si gibi görünüyorsa olası iş numaralarını
 * döner; değilse `null`. Her girdide güvenlidir (string olmayan, boş, tireli
 * normal arama terimi → `null`).
 *
 * Gövde `T` içerebildiği için YALNIZ sondaki `T` + 6 rakam ek sayılır ve geriye
 * kalan geçerli bir gövde uzunluğundaysa soyulur; ek yoksa (ya da soyulunca gövde
 * kalmıyorsa) yapıştırılan metnin tamamı gövde sayılır.
 */
export function parsePaytrMerchantOid(input: unknown): ParsedPaytrOid | null {
  if (typeof input !== "string") return null;
  const oid = input.trim().toUpperCase();
  if (!oid) return null;

  const candidates: PaytrOidCandidate[] = [];
  for (const { subject, oidPrefix, numberPrefix } of PAYTR_OID_SUBJECTS) {
    if (!oid.startsWith(oidPrefix)) continue;
    const tail = oid.slice(oidPrefix.length);
    const bodies = new Set<string>();
    const stripped = SUFFIX_PATTERN.exec(tail)?.[1];
    if (stripped && BODY_PATTERN.test(stripped)) bodies.add(stripped);
    if (BODY_PATTERN.test(tail)) bodies.add(tail);
    for (const body of bodies) {
      candidates.push({ subject, number: `${numberPrefix}-${body}` });
    }
  }
  return candidates.length > 0 ? { oid, candidates } : null;
}
