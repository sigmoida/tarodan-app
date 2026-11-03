/**
 * PayTR installment vocabulary and the `taksit-oranlari` response parser.
 * Pure: no DI, no I/O. The HTTP call lives in `PayTRService.getInstallmentRates`.
 *
 * Sources (read 2026-11-03):
 * - Direkt API 1. Adim, https://dev.paytr.com/direkt-api/direkt-api-1-adim:
 *   `installment_count` "0, 2-12"; `card_type` "Kart tipi (Taksitli islemlerde
 *   kullanmak uzere)": advantage, axess, combo, bonus, cardfinans, maximum,
 *   paraf, world, saglamkart.
 * - BIN Sorgulama, https://dev.paytr.com/direkt-api/bin-sorgulama-servisi:
 *   `brand` is one of the same families, or "none" (no installments through
 *   PayTR for that card).
 * - Taksit Oranlari Sorgulama, https://dev.paytr.com/direkt-api/taksit-sorgulama:
 *   `oranlar` holds the rates per installment count, grouped by card family
 *   (axess, world, maximum, cardfinans, paraf, advantage, combo, bonus). Its
 *   inner shape is NOT documented, so the parser below accepts only shapes
 *   whose meaning is unambiguous and reports everything else in `ignored`.
 */

/** Card program families PayTR accepts as `card_type` (and returns as BIN `brand`). */
export const PAYTR_CARD_FAMILIES = [
  "advantage",
  "axess",
  "bonus",
  "cardfinans",
  "combo",
  "maximum",
  "paraf",
  "saglamkart",
  "world",
] as const;

export type PaytrCardFamily = (typeof PAYTR_CARD_FAMILIES)[number];

export function isPaytrCardFamily(value: unknown): value is PaytrCardFamily {
  return (
    typeof value === "string" &&
    (PAYTR_CARD_FAMILIES as readonly string[]).includes(value)
  );
}

/** Installment counts PayTR accepts besides "0" (single payment). */
export const PAYTR_INSTALLMENT_COUNT_MIN = 2;
export const PAYTR_INSTALLMENT_COUNT_MAX = 12;

/** True for an integer installment count PayTR can charge (2-12). */
export function isPaytrInstallmentCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PAYTR_INSTALLMENT_COUNT_MIN &&
    value <= PAYTR_INSTALLMENT_COUNT_MAX
  );
}

/**
 * Rates by family, then by installment count ("2".."12"; "1" is kept when
 * PayTR lists it for a family). The value is the rate exactly as PayTR
 * published it, as a dot-decimal string ("2.83"), so no float rounding
 * happens here: callers convert it with `new Prisma.Decimal(value)`.
 * Whether the number is a percent or a ratio is not documented (hub plan
 * 2026-11-03, question [PayTR] Q1); this parser does not reinterpret it.
 */
export type PaytrInstallmentRateTable = Partial<
  Record<PaytrCardFamily, Record<string, string>>
>;

export interface ParsedPaytrInstallmentRates {
  rates: PaytrInstallmentRateTable;
  /**
   * Paths of entries that were not understood and left out of `rates`
   * (unknown family, unknown key, ambiguous or conflicting value). Key paths
   * only, never values: safe to log. The raw payload keeps everything.
   */
  ignored: string[];
}

export type PaytrInstallmentRatesResult =
  | {
      ok: true;
      requestId: string;
      /** `max_inst_non_bus`: the store's maximum count for non-business cards. */
      maxInstallmentNonBusiness?: number;
      rates: PaytrInstallmentRateTable;
      ignored: string[];
      /** The whole PayTR answer, for the rate snapshot (no credentials in it). */
      raw: Record<string, unknown>;
    }
  | { ok: false; errMsg: string };

/**
 * `bin-detail` answer. `outcome` follows the doc's `status`: "success";
 * "failed" = BIN not defined (e.g. a foreign card), stable and cacheable;
 * "error" = the query or the network failed, not cacheable.
 */
export type PaytrBinLookupResult =
  | {
      ok: true;
      outcome: "success";
      /** `bank`, e.g. "Yapi Kredi". */
      bank?: string;
      /** `bankCode` as text (the doc's example "0010" has leading zeros). */
      bankCode?: string;
      /** `schema`: VISA | MASTERCARD | AMEX | TROY | OTHER. */
      schema?: string;
      /** `cardType`: credit | debit. */
      cardType?: string;
      /** `brand` as sent, lower-cased; "none" = no installments through PayTR. */
      brand?: string;
      /** `brand` when it is a PayTR card family; undefined for "none" or unknown. */
      cardFamily?: PaytrCardFamily;
      /** `businessCard` y/n; undefined when PayTR sent something else. */
      businessCard?: boolean;
      /** `allow_non3d` Y/N. */
      allowNon3d?: boolean;
    }
  | { ok: false; outcome: "failed" | "error"; errMsg: string };

/** "taksit_2", "2", "2_taksit", "taksit-2" -> 2 (only 1-12). */
const COUNT_KEY = /^(?:taksit[_-]?)?(\d{1,2})(?:[_-]?taksit)?$/i;
/** A non-negative decimal with a dot or a Turkish comma. */
const RATE_TEXT = /^\d{1,3}(?:[.,]\d+)?$/;

function countOf(key: string): number | null {
  const match = COUNT_KEY.exec(key.trim());
  if (!match) return null;
  const count = Number.parseInt(match[1], 10);
  return count >= 1 && count <= PAYTR_INSTALLMENT_COUNT_MAX ? count : null;
}

/** Normalizes a rate to a dot-decimal string in [0, 100), else null. */
function rateOf(value: unknown): string | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return null;
  }
  if (!RATE_TEXT.test(text)) return null;
  const normalized = text.replace(",", ".");
  return Number(normalized) < 100 ? normalized : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses `oranlar` defensively. Accepted shapes:
 * - `{ <family>: { <countKey>: <rate>, ... }, ... }` (the expected one);
 * - a family value that is an array of such count-keyed objects (merged);
 * - `oranlar` itself an array of family-keyed objects (merged).
 *
 * A plain list of numbers is ambiguous (does index 0 mean 1 or 2
 * installments?) and is ignored, as are unknown families and keys, values
 * that are not a decimal in [0, 100), and a count that two entries give
 * different rates for (dropped, fail closed). Never throws.
 */
export function parsePaytrInstallmentRates(
  oranlar: unknown,
): ParsedPaytrInstallmentRates {
  const rates: PaytrInstallmentRateTable = {};
  const ignored: string[] = [];
  const conflicted = new Set<string>();

  const addCount = (
    family: PaytrCardFamily,
    count: number,
    rate: string,
    path: string,
  ) => {
    const conflictKey = `${family}.${count}`;
    if (conflicted.has(conflictKey)) return;
    const table = (rates[family] ??= {});
    const existing = table[String(count)];
    if (existing !== undefined && existing !== rate) {
      delete table[String(count)];
      conflicted.add(conflictKey);
      ignored.push(`${path} (conflicting rate)`);
      return;
    }
    table[String(count)] = rate;
  };

  const readCounts = (
    family: PaytrCardFamily,
    value: unknown,
    path: string,
  ) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (isPlainObject(item)) readCounts(family, item, `${path}[${index}]`);
        else ignored.push(`${path}[${index}]`);
      });
      return;
    }
    if (!isPlainObject(value)) {
      ignored.push(path);
      return;
    }
    for (const [key, raw] of Object.entries(value)) {
      const count = countOf(key);
      const rate = count === null ? null : rateOf(raw);
      if (count === null || rate === null) {
        ignored.push(`${path}.${key}`);
        continue;
      }
      addCount(family, count, rate, `${path}.${key}`);
    }
  };

  const readFamilies = (value: Record<string, unknown>, path: string) => {
    for (const [key, raw] of Object.entries(value)) {
      const family = key.trim().toLowerCase();
      if (!isPaytrCardFamily(family)) {
        ignored.push(`${path}.${key}`);
        continue;
      }
      readCounts(family, raw, `${path}.${key}`);
    }
  };

  if (Array.isArray(oranlar)) {
    oranlar.forEach((item, index) => {
      if (isPlainObject(item)) readFamilies(item, `oranlar[${index}]`);
      else ignored.push(`oranlar[${index}]`);
    });
  } else if (isPlainObject(oranlar)) {
    readFamilies(oranlar, "oranlar");
  } else {
    ignored.push("oranlar");
  }

  for (const family of Object.keys(rates) as PaytrCardFamily[]) {
    if (Object.keys(rates[family] ?? {}).length === 0) delete rates[family];
  }
  return { rates, ignored };
}

/** `max_inst_non_bus` as an integer 0-12, else undefined. */
export function parsePaytrMaxInstallment(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const text = String(value).trim();
  if (!/^\d{1,2}$/.test(text)) return undefined;
  const count = Number.parseInt(text, 10);
  return count <= PAYTR_INSTALLMENT_COUNT_MAX ? count : undefined;
}
