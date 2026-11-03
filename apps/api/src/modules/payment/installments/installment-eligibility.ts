import { OrderOrigin, PaytrMerchant, Prisma } from "@prisma/client";
import { INSTALLMENT_COUNT_MAX, INSTALLMENT_COUNT_MIN } from "@tarodan/types";
import type { InstallmentBuyerSegment } from "@tarodan/types";
import {
  isPaytrCardFamily,
  type PaytrCardFamily,
} from "../../payment-providers/paytr/paytr-installments";
import { INSTALLMENT_KEEP_GUARD_ENABLED } from "./installment-config";
import {
  keepGuardHolds,
  priceInstallment,
  type InstallmentPrice,
  type KeepGuardSlice,
} from "./installment-pricing";
import {
  resolveInstallmentRule,
  type InstallmentRuleCandidate,
  type ResolvedInstallmentRule,
} from "./installment-rules";

/**
 * Who, what and which card can pay in installments (ADR 0019, plan 5.2). One
 * predicate set, used by the options call and by the signing call; pure.
 */

// ── Payment kind (D6) ───────────────────────────────────────────────────────

/** Order origins that may be paid in installments: goods purchases only. */
const INSTALLMENT_ORDER_ORIGINS: readonly OrderOrigin[] = [
  OrderOrigin.direct_sale,
  OrderOrigin.offer,
];

export interface InstallmentPaymentKind {
  paytrMerchant: PaytrMerchant;
  tradeCashPaymentId: string | null;
  orderId: string | null;
  checkoutGroupId: string | null;
  /** The origin of every order the payment covers. */
  orderOrigins: readonly OrderOrigin[];
}

/**
 * D6: cart and group checkout, direct buy, guest checkout and offer orders on
 * the marketplace store. Never a trade cash payment, a membership (its own
 * store; renewals are recurring and always single), a boost or any other
 * `platform_service` order.
 */
export function paymentKindAllowsInstallments(
  kind: InstallmentPaymentKind,
): boolean {
  return (
    kind.paytrMerchant === PaytrMerchant.marketplace &&
    !kind.tradeCashPaymentId &&
    (!!kind.orderId || !!kind.checkoutGroupId) &&
    kind.orderOrigins.length > 0 &&
    kind.orderOrigins.every((origin) =>
      INSTALLMENT_ORDER_ORIGINS.includes(origin),
    )
  );
}

// ── Card (D5) ───────────────────────────────────────────────────────────────

export interface InstallmentCardFacts {
  /** PayTR `cardType`: credit | debit. */
  cardType?: string | null;
  /** The PayTR card family; undefined for `brand = none` or unknown. */
  family?: PaytrCardFamily | null;
  /** PayTR `businessCard`; undefined = not known. */
  businessCard?: boolean | null;
}

/**
 * D5: a credit card of a PayTR installment family that is known not to be a
 * business card. Unknown facts fail closed (single payment).
 */
export function cardAllowsInstallments(card: InstallmentCardFacts): boolean {
  return (
    card.cardType === "credit" &&
    isPaytrCardFamily(card.family) &&
    card.businessCard === false
  );
}

// ── Counts PayTR offers ─────────────────────────────────────────────────────

/** The rate snapshot fields pricing reads. */
export interface InstallmentRateSource {
  id: string;
  fetchedAt: Date;
  /** r1, percent. */
  singleRatePct: Prisma.Decimal;
  maxInstallmentNonBusiness: number | null;
  /** Normalized `{ family: { "2": "8.5", ... } }` (strings or numbers). */
  rates: Prisma.JsonValue;
}

const RATE_TEXT = /^\d{1,2}(?:\.\d+)?$/;

function rateOf(value: unknown): Prisma.Decimal | null {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : null;
  return text !== null && RATE_TEXT.test(text)
    ? new Prisma.Decimal(text)
    : null;
}

/** Card families present in a snapshot's rate table. */
export function rateFamiliesOf(rates: Prisma.JsonValue): PaytrCardFamily[] {
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) return [];
  return Object.keys(rates).filter(isPaytrCardFamily).sort();
}

export interface OfferedCount {
  count: number;
  /** rn, percent. */
  installmentRatePct: Prisma.Decimal;
}

/**
 * D2: the counts 2..`max_inst_non_bus` that the family's rate row lists, with
 * their rate; no platform cap. Fails closed (no counts) without
 * `max_inst_non_bus` or a row for the family; a value that is not a rate in
 * [0, 100) drops its count.
 */
export function offeredInstallmentCounts(
  snapshot: Pick<InstallmentRateSource, "maxInstallmentNonBusiness" | "rates">,
  family: PaytrCardFamily,
): OfferedCount[] {
  const max = snapshot.maxInstallmentNonBusiness;
  if (max === null || !Number.isInteger(max) || max < INSTALLMENT_COUNT_MIN) {
    return [];
  }
  const { rates } = snapshot;
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) return [];
  const row = (rates as Record<string, unknown>)[family];
  if (!row || typeof row !== "object" || Array.isArray(row)) return [];
  const offered: OfferedCount[] = [];
  const upTo = Math.min(max, INSTALLMENT_COUNT_MAX);
  for (let count = INSTALLMENT_COUNT_MIN; count <= upTo; count += 1) {
    const rate = rateOf((row as Record<string, unknown>)[String(count)]);
    if (rate) offered.push({ count, installmentRatePct: rate });
  }
  return offered;
}

// ── The offer ───────────────────────────────────────────────────────────────

export interface InstallmentOffer {
  price: InstallmentPrice;
  installmentRatePct: Prisma.Decimal;
  rule: ResolvedInstallmentRule;
}

export interface InstallmentOfferInput {
  /** T. */
  baseAmount: Prisma.Decimal;
  snapshot: InstallmentRateSource;
  family: PaytrCardFamily;
  segment: InstallmentBuyerSegment;
  /** Rule versions that may apply (the caller's live query). */
  rules: readonly InstallmentRuleCandidate[];
  now: Date;
  feeVatRatePct: Prisma.Decimal;
  /**
   * The payment's order slices for the keep guard (AS-P5); null when no
   * order exists yet (web checkout `amount` mode): the guard then runs only
   * at signing.
   */
  slices: readonly KeepGuardSlice[] | null;
}

export interface InstallmentOfferResult {
  /** The counts above 1 that may be charged, ascending. */
  offers: InstallmentOffer[];
  /** Counts PayTR offers for the card family. */
  offeredByPaytr: number[];
  /** Counts a winning rule disallows. */
  excludedByRule: number[];
  /** Counts the keep guard refuses. */
  excludedByKeepGuard: number[];
  /** Counts whose rates the formula cannot price (fail closed). */
  unpriceable: number[];
}

export function evaluateInstallmentOffer(
  input: InstallmentOfferInput,
): InstallmentOfferResult {
  const result: InstallmentOfferResult = {
    offers: [],
    offeredByPaytr: [],
    excludedByRule: [],
    excludedByKeepGuard: [],
    unpriceable: [],
  };
  for (const { count, installmentRatePct } of offeredInstallmentCounts(
    input.snapshot,
    input.family,
  )) {
    result.offeredByPaytr.push(count);
    const rule = resolveInstallmentRule(
      input.rules,
      input.segment,
      count,
      input.now,
    );
    if (!rule.allowed) {
      result.excludedByRule.push(count);
      continue;
    }
    let price: InstallmentPrice;
    try {
      price = priceInstallment({
        baseAmount: input.baseAmount,
        count,
        singleRatePct: input.snapshot.singleRatePct,
        installmentRatePct,
        platformSharePct: rule.platformSharePct,
        feeVatRatePct: input.feeVatRatePct,
      });
    } catch (error: unknown) {
      // Rates outside the formula's domain: that count is not charged.
      if (error instanceof RangeError) {
        result.unpriceable.push(count);
        continue;
      }
      throw error;
    }
    if (
      INSTALLMENT_KEEP_GUARD_ENABLED &&
      input.slices &&
      !keepGuardHolds(price, installmentRatePct, input.slices)
    ) {
      result.excludedByKeepGuard.push(count);
      continue;
    }
    result.offers.push({ price, installmentRatePct, rule });
  }
  return result;
}
