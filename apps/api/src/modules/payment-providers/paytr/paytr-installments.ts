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
 *   inner shape is not documented.
 * - Staging capture with `single_ratio=1` (2026-11-06, hub plan S0; fixture
 *   `test/fixtures/paytr-taksit-oranlari-staging.ts`): `oranlar` is
 *   `{ <family>: { taksit_2..taksit_12: <number> }, tumu: { tek_cekim: <number> } }`
 *   for all nine families above, rates as JSON numbers in percent with binary
 *   float noise (7.4299999999999997), and `max_inst_non_bus` a number.
 *   `tumu` ("all cards") is not a card family: it carries the single-payment
 *   rate. The parser keeps accepting only shapes whose meaning is
 *   unambiguous and reports everything else in `ignored`.
 */

import { Prisma } from "@prisma/client";
import { isPlainRecord } from "./paytr-response.util";

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
 * The `oranlar` key that holds rates for all cards rather than one family
 * ("tumu" = all), and its single-payment rate key. Together the one source
 * of the store's single-payment rate r1 (staging capture, S0).
 */
export const PAYTR_ALL_CARDS_KEY = "tumu";
export const PAYTR_SINGLE_RATE_KEY = "tek_cekim";

/**
 * Rates by family, then by installment count ("2".."12"; "1" is kept when
 * PayTR lists it for a family). The value is the rate as PayTR published
 * it, as a dot-decimal string ("2.83") normalized by `parsePaytrRate`:
 * callers convert it with `new Prisma.Decimal(value)`. The number is a
 * percent (AS-P1, `paytrRateToRatio`); this parser does not reinterpret it.
 */
export type PaytrInstallmentRateTable = Partial<
  Record<PaytrCardFamily, Record<string, string>>
>;

export interface ParsedPaytrInstallmentRates {
  rates: PaytrInstallmentRateTable;
  /**
   * The single-payment rate r1 from `oranlar.tumu.tek_cekim`, as a
   * dot-decimal string; undefined when absent, not a rate, or given twice
   * with different values (fail closed).
   */
  singleRatePct?: string;
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
      /**
       * The store's single-payment rate (r1) as a dot-decimal string, from
       * `oranlar.tumu.tek_cekim` (`parsePaytrInstallmentRates`); undefined
       * when PayTR sent no usable one (then no snapshot is stored).
       */
      singleRatePct?: string;
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

/**
 * Decimals a PayTR rate is kept to: the scale of
 * `installment_rate_snapshots.single_rate_pct` (`Decimal(6,3)`), so the single
 * rate and the family rates of one snapshot have the same precision. PayTR
 * publishes two decimals; anything finer is float noise.
 */
export const PAYTR_RATE_SCALE = 3;

/**
 * A PayTR rate as a dot-decimal string in [0, 100), else null: a number or a
 * text with a dot or a Turkish comma. The one reading of a rate value, for
 * the PayTR answer and for the stored snapshot alike.
 *
 * Deterministic normalization: a JSON number becomes its shortest round-trip
 * text (ECMAScript `String(number)`), so the literal 7.4299999999999997
 * reads as "7.43"; a value with more than `PAYTR_RATE_SCALE` decimals (a text
 * carrying the noise, or a computed float like 0.30000000000000004) is
 * rounded half up to that scale. A value with fewer decimals is kept as
 * published ("2.90" stays "2.90"; compare rates as numbers, not text).
 */
export function parsePaytrRate(value: unknown): string | null {
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
  let normalized = text.replace(",", ".");
  const decimals = normalized.split(".")[1]?.length ?? 0;
  if (decimals > PAYTR_RATE_SCALE) {
    normalized = new Prisma.Decimal(normalized)
      .toDecimalPlaces(PAYTR_RATE_SCALE, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed();
  }
  // Checked after rounding: 99.9996 rounds to 100, which is not a rate.
  return Number(normalized) < 100 ? normalized : null;
}

/**
 * Parses `oranlar` defensively. Accepted shapes:
 * - `{ <family>: { <countKey>: <rate>, ... }, ..., tumu: { tek_cekim: <rate> } }`
 *   (the staging capture);
 * - a family value that is an array of such count-keyed objects (merged);
 * - `oranlar` itself an array of family-keyed objects (merged).
 *
 * `tumu` is read for the single-payment rate only; any other key in it is
 * ignored (an all-cards installment row would have no family to price).
 * A plain list of numbers is ambiguous (does index 0 mean 1 or 2
 * installments?) and is ignored, as are unknown families and keys, values
 * that are not a decimal in [0, 100), and a count or a single rate that two
 * entries give different rates for (dropped, fail closed). Never throws.
 */
export function parsePaytrInstallmentRates(
  oranlar: unknown,
): ParsedPaytrInstallmentRates {
  const rates: PaytrInstallmentRateTable = {};
  const ignored: string[] = [];
  const conflicted = new Set<string>();
  let singleRatePct: string | undefined;
  let singleConflicted = false;

  const addSingle = (rate: string, path: string) => {
    if (singleConflicted) return;
    if (singleRatePct === undefined) {
      singleRatePct = rate;
    } else if (Number(singleRatePct) !== Number(rate)) {
      singleRatePct = undefined;
      singleConflicted = true;
      ignored.push(`${path} (conflicting rate)`);
    }
  };

  const readAllCards = (value: unknown, path: string) => {
    if (!isPlainRecord(value)) {
      ignored.push(path);
      return;
    }
    for (const [key, raw] of Object.entries(value)) {
      const rate =
        key.trim().toLowerCase() === PAYTR_SINGLE_RATE_KEY
          ? parsePaytrRate(raw)
          : null;
      if (rate === null) ignored.push(`${path}.${key}`);
      else addSingle(rate, `${path}.${key}`);
    }
  };

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
    // Compared as numbers: "2.8" and "2.80" are the same rate, not a conflict.
    if (existing !== undefined && Number(existing) !== Number(rate)) {
      delete table[String(count)];
      conflicted.add(conflictKey);
      ignored.push(`${path} (conflicting rate)`);
      return;
    }
    if (existing === undefined) table[String(count)] = rate;
  };

  const readCounts = (
    family: PaytrCardFamily,
    value: unknown,
    path: string,
  ) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (isPlainRecord(item)) readCounts(family, item, `${path}[${index}]`);
        else ignored.push(`${path}[${index}]`);
      });
      return;
    }
    if (!isPlainRecord(value)) {
      ignored.push(path);
      return;
    }
    for (const [key, raw] of Object.entries(value)) {
      const count = countOf(key);
      const rate = count === null ? null : parsePaytrRate(raw);
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
      if (family === PAYTR_ALL_CARDS_KEY) {
        readAllCards(raw, `${path}.${key}`);
        continue;
      }
      if (!isPaytrCardFamily(family)) {
        ignored.push(`${path}.${key}`);
        continue;
      }
      readCounts(family, raw, `${path}.${key}`);
    }
  };

  if (Array.isArray(oranlar)) {
    oranlar.forEach((item, index) => {
      if (isPlainRecord(item)) readFamilies(item, `oranlar[${index}]`);
      else ignored.push(`oranlar[${index}]`);
    });
  } else if (isPlainRecord(oranlar)) {
    readFamilies(oranlar, "oranlar");
  } else {
    ignored.push("oranlar");
  }

  for (const family of Object.keys(rates) as PaytrCardFamily[]) {
    if (Object.keys(rates[family] ?? {}).length === 0) delete rates[family];
  }
  return { rates, singleRatePct, ignored };
}

/**
 * A PayTR installment count field as an integer 0-12, else undefined: the
 * callback's `installment_count` (Direkt API 2. Adim), the status inquiry's
 * `taksit` (Durum Sorgu, "0, 2-12") and `max_inst_non_bus` (Taksit Oranlari).
 * 0 and 1 mean a single payment. Digits only: "13", "-1", "2x" and "2.5" are
 * not counts, so every path stores the same value for the same answer.
 */
export function parsePaytrInstallmentCount(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const text = String(value).trim();
  if (!/^\d{1,2}$/.test(text)) return undefined;
  const count = Number.parseInt(text, 10);
  return count <= PAYTR_INSTALLMENT_COUNT_MAX ? count : undefined;
}
