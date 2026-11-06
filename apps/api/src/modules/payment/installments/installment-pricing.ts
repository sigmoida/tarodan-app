import { Prisma } from "@prisma/client";
import { INSTALLMENT_COUNT_MAX } from "@tarodan/types";
import { paytrRateToRatio } from "./installment-config";

/**
 * THE installment formula (tarodan-ops plan 2026-11-03, section 4.2; ADR
 * 0019). Pure, Decimal only. The options shown to the buyer, the admin
 * preview and the signed `payment_amount` all call `priceInstallment`; a
 * second copy would drift.
 *
 *   if s_n == 1 or rn <= r1:  C = T, F = 0
 *   else:  C_raw = T * (1 - r1 - k - s_n * (rn - r1)) / (1 - rn - k)
 *          C     = max(T, n * ceil_kurus(C_raw / n))   // equal installments
 *   F = C - T
 *   P = max(0, round2( T*(1 - r1) - (C*(1 - rn) - k*F) ))
 *
 * r1, rn: PayTR's deduction for a single payment and for n installments of
 * the card family (AS-P1, `paytrRateToRatio`); k = v / (1 + v): the VAT
 * inside F (AS-F1); s_n: the platform share from the buyer's segment rule
 * (0 = the buyer pays all, the default). With s_n = 0 the platform keeps its
 * single-payment net; P is what it keeps less than that.
 */

type Decimal = Prisma.Decimal;
const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const ZERO = D(0);
const ONE = D(1);
const HUNDRED = D(100);

/** Two decimals, half up (the money rounding of the codebase). */
function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Up to the next kuruş. The value is first settled to 10 places so that a
 * quotient that is a whole kuruş in exact arithmetic (k = 1/6 is not finite in
 * decimal) is not pushed up by its last digit.
 */
function ceilKurus(value: Decimal): Decimal {
  return value
    .toDecimalPlaces(10, Prisma.Decimal.ROUND_HALF_UP)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_CEIL);
}

export interface InstallmentPriceInput {
  /** T: the goods total, TL, two decimals, > 0. */
  baseAmount: Decimal;
  /** n: 1 (single payment) or 2..12. */
  count: number;
  /** r1, percent (AS-P1). */
  singleRatePct: Decimal;
  /** rn, percent (AS-P1). Ignored for count 1. */
  installmentRatePct: Decimal;
  /** s_n x 100: 0 = buyer pays all, 100 = no installment fee. */
  platformSharePct: Decimal;
  /** v, percent: the VAT rate inside F (`INSTALLMENT_FEE_VAT_RATE_PCT`). */
  feeVatRatePct: Decimal;
}

export interface InstallmentPrice {
  count: number;
  /** C: what the card is charged (the signed `payment_amount`). */
  chargedAmount: Decimal;
  /** F = C - T: the buyer's installment fee, VAT included. */
  feeAmount: Decimal;
  /** C / n: exact when F > 0; rounded half up when F = 0 (the bank rounds). */
  monthlyAmount: Decimal;
  /** P: the expected platform installment cost of the charge. */
  platformCostAmount: Decimal;
}

function assertPercent(value: Decimal, name: string, allowHundred: boolean) {
  if (
    value.isNegative() ||
    (allowHundred ? value.greaterThan(HUNDRED) : value.gte(HUNDRED))
  ) {
    throw new RangeError(`${name} out of range: ${value.toString()}`);
  }
}

function assertInput(input: InstallmentPriceInput): void {
  const { baseAmount, count } = input;
  if (!baseAmount.gt(ZERO) || !baseAmount.equals(round2(baseAmount))) {
    throw new RangeError(`baseAmount must be > 0 with two decimals`);
  }
  if (!Number.isInteger(count) || count < 1 || count > INSTALLMENT_COUNT_MAX) {
    throw new RangeError(`count out of range: ${count}`);
  }
  assertPercent(input.singleRatePct, "singleRatePct", false);
  assertPercent(input.installmentRatePct, "installmentRatePct", false);
  assertPercent(input.platformSharePct, "platformSharePct", true);
  assertPercent(input.feeVatRatePct, "feeVatRatePct", false);
}

/** The single payment of T: no fee, no platform cost. */
export function singlePaymentPrice(baseAmount: Decimal): InstallmentPrice {
  return {
    count: 1,
    chargedAmount: baseAmount,
    feeAmount: ZERO,
    monthlyAmount: baseAmount,
    platformCostAmount: ZERO,
  };
}

/** k = v / (1 + v), from v in percent. */
export function feeVatShareOf(feeVatRatePct: Decimal): Decimal {
  return feeVatRatePct.div(HUNDRED.plus(feeVatRatePct));
}

/** Prices one count. Throws a RangeError on inputs outside the domain. */
export function priceInstallment(
  input: InstallmentPriceInput,
): InstallmentPrice {
  assertInput(input);
  const T = input.baseAmount;
  const n = input.count;
  if (n === 1) return singlePaymentPrice(T);

  const r1 = paytrRateToRatio(input.singleRatePct);
  const rn = paytrRateToRatio(input.installmentRatePct);
  const s = input.platformSharePct.div(HUNDRED);
  const k = feeVatShareOf(input.feeVatRatePct);

  let C: Decimal;
  if (s.gte(ONE) || rn.lte(r1)) {
    C = T;
  } else {
    const denominator = ONE.minus(rn).minus(k);
    if (!denominator.gt(ZERO)) {
      throw new RangeError("installment rate and VAT leave nothing to charge");
    }
    const cRaw = T.times(
      ONE.minus(r1)
        .minus(k)
        .minus(s.times(rn.minus(r1))),
    ).div(denominator);
    const perInstallment = ceilKurus(cRaw.div(n));
    C = Prisma.Decimal.max(T, perInstallment.times(n));
  }
  const F = C.minus(T);
  const monthly = F.isZero() ? round2(C.div(n)) : C.div(n);
  const platformNet = C.times(ONE.minus(rn)).minus(k.times(F));
  const P = Prisma.Decimal.max(
    ZERO,
    round2(T.times(ONE.minus(r1)).minus(platformNet)),
  );
  return {
    count: n,
    chargedAmount: C,
    feeAmount: F,
    monthlyAmount: monthly,
    platformCostAmount: P,
  };
}

/**
 * The order of a payment's orders wherever its installment fee is split over
 * them: the keep guard at pricing and the allocation at capture must see the
 * same order (cart orders by creation, then id).
 */
export const INSTALLMENT_FEE_SPLIT_ORDER_BY = [
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.OrderOrderByWithRelationInput[];

/**
 * Splits `fee` over `weights` (the orders' `totalAmount`) in whole kuruş by
 * largest remainder: each share is floored, the kuruş left over go to the
 * largest remainders, ties to the earlier entry. The shares always sum to
 * `fee` exactly. The capture (order `installmentFeeAmount`) and the keep
 * guard use this one split.
 */
export function allocateInstallmentFee(
  fee: Decimal,
  weights: readonly Decimal[],
): Decimal[] {
  if (weights.length === 0) return [];
  if (fee.isNegative() || !fee.equals(round2(fee))) {
    throw new RangeError("fee must be >= 0 with two decimals");
  }
  if (weights.some((w) => w.isNegative())) {
    throw new RangeError("weights must be >= 0");
  }
  const totalWeight = weights.reduce((sum, w) => sum.plus(w), ZERO);
  const feeKurus = fee.times(HUNDRED);
  if (totalWeight.isZero()) {
    // No basis to split on: everything goes to the first order.
    return weights.map((_, i) => (i === 0 ? fee : ZERO));
  }
  const exact = weights.map((w) => feeKurus.times(w).div(totalWeight));
  const floors = exact.map((e) => e.floor());
  let left = feeKurus
    .minus(floors.reduce((sum, f) => sum.plus(f), ZERO))
    .toNumber();
  const order = exact
    .map((e, i) => ({ i, remainder: e.minus(floors[i]) }))
    .sort((a, b) => b.remainder.comparedTo(a.remainder) || a.i - b.i);
  const kurus = [...floors];
  for (const { i } of order) {
    if (left <= 0) break;
    kurus[i] = kurus[i].plus(1);
    left -= 1;
  }
  return kurus.map((k) => k.div(HUNDRED));
}

/** One order slice of a payment, for the keep guard. */
export interface KeepGuardSlice {
  /** The order's goods total (`Order.totalAmount`). */
  totalAmount: Decimal;
  /** What the seller is transferred for it (`submerchant_amount`). */
  sellerAmount: Decimal;
}

/**
 * AS-P5 keep guard: with the fee allocated to the orders, every slice's
 * margin `orderCharged - sellerAmount` must cover PayTR's deduction on it,
 * `rn * orderCharged`. False = the count is not offered.
 */
export function keepGuardHolds(
  price: InstallmentPrice,
  installmentRatePct: Decimal,
  slices: readonly KeepGuardSlice[],
): boolean {
  if (price.count === 1 || slices.length === 0) return true;
  const rn = paytrRateToRatio(installmentRatePct);
  const fees = allocateInstallmentFee(
    price.feeAmount,
    slices.map((s) => s.totalAmount),
  );
  return slices.every((slice, i) => {
    const charged = slice.totalAmount.plus(fees[i]);
    const deduction = round2(charged.times(rn));
    return !charged.minus(slice.sellerAmount).minus(deduction).isNegative();
  });
}
