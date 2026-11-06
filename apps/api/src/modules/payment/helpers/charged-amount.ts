import { Prisma, RefundAttemptStatus } from "@prisma/client";
import { MONEY_EPSILON } from "./payment.constants";

/**
 * The two money scales of a payment (ADR 0019):
 *
 * - goods scale, T: `Payment.amount` (and `Order.totalAmount`). Commission,
 *   buyer fees, stopaj, the escrow hold, the seller net and the refund
 *   policy derive from it;
 * - PSP scale, C = T + F: what PayTR charged, with F the installment fee
 *   (vade farkı). Every comparison with a PayTR amount and every PayTR call
 *   uses it.
 *
 * This module is the ONLY reader of the PSP-scale columns
 * (`Payment.chargedAmount`, `Order.installmentFeeAmount`,
 * `RefundAttempt.installmentFeeAmount`). Never derive them inline: a second
 * copy of a rule drifts.
 *
 * Captured vs pending: the columns are written at CAPTURE from the captured
 * charge attempt. Before capture (the callback, the status inquiry or a
 * statement line of a signed form) the expected PayTR amount is that oid's
 * `PaymentChargeAttempt.chargedAmount`, never `chargedAmountOf(payment)`,
 * which is still T: `expectedPaytrChargeFor` / `paytrChargeExpectationsOf`
 * read it by oid.
 *
 * Comparisons: every check of a PayTR-reported amount (callback
 * `total_amount`, status inquiry `payment_amount`, a statement line) against
 * ours goes through `paytrAmountMatches` / `paytrKurusMatches`, with the
 * expected amount from this module. A contract spec
 * (`charged-amount-contract.spec.ts`) fails a comparison that bypasses it.
 */

/** The fields `chargedAmountOf` reads. */
export interface ChargedAmountSource {
  amount: Prisma.Decimal;
  chargedAmount: Prisma.Decimal | null;
}

/**
 * What PayTR charged for a CAPTURED payment, C.
 *
 * NULL `chargedAmount` means a legacy payment, or one captured without an
 * attempt; PayTR then charged exactly `amount` (the DB CHECK
 * `payments_charged_amount_check` allows no fee without a charged amount and
 * keeps `chargedAmount = amount + installmentFeeAmount` when it is set).
 * Not for a pending payment: see the module comment.
 */
export function chargedAmountOf(payment: ChargedAmountSource): Prisma.Decimal {
  return payment.chargedAmount ?? payment.amount;
}

/** The fields `orderChargedTotalOf` reads. */
export interface OrderChargedTotalSource {
  totalAmount: Prisma.Decimal;
  installmentFeeAmount: Prisma.Decimal;
}

/**
 * The order's slice of what PayTR charged: its goods total plus the share of
 * the installment fee allocated to it at capture (0 for single payments and
 * legacy orders). The PSP-scale base of the transfer slice and the refund
 * fee share; commission, hold and seller net stay on `totalAmount`.
 */
export function orderChargedTotalOf(
  order: OrderChargedTotalSource,
): Prisma.Decimal {
  return order.totalAmount.plus(order.installmentFeeAmount);
}

/** The order's share F_o of the payment's installment fee (0 = none). */
export function orderInstallmentFeeOf(
  order: Pick<OrderChargedTotalSource, "installmentFeeAmount">,
): Prisma.Decimal {
  return order.installmentFeeAmount;
}

/** The fields `refundGoodsPartOf` reads. */
export interface RefundGoodsPartSource {
  amount: Prisma.Decimal;
  installmentFeeAmount: Prisma.Decimal;
}

/**
 * The goods-scale part of a refund attempt: `amount` is the PayTR
 * `return_amount` and includes the installment fee share given back with it
 * (DB CHECK: 0 <= fee share <= amount). Refund caps, "fully refunded" and the
 * group refund limit compare this, never `amount`, with goods totals.
 */
export function refundGoodsPartOf(
  attempt: RefundGoodsPartSource,
): Prisma.Decimal {
  return attempt.amount.minus(attempt.installmentFeeAmount);
}

// ── The installment fee share of a refund (ADR 0019, D7) ────────────────────

/**
 * Below this much goods money left, an order (or a payment) counts as fully
 * refunded: the refund flow's own "fully refunded" tolerance, so the fee
 * remainder goes with the refund that closes it.
 */
const GOODS_COMPLETION_EPSILON = new Prisma.Decimal(MONEY_EPSILON);

/** An earlier refund attempt of the payment, as the fee share reads it. */
export interface PriorFeeRefund extends RefundGoodsPartSource {
  orderId: string | null;
}

export interface InstallmentFeeShareInput {
  /** The order this refund is for. */
  orderId: string;
  /** F_o: the order's share of the installment fee (`Order.installmentFeeAmount`). */
  orderFee: Prisma.Decimal;
  /** T_o: the order's goods total the refund flow caps against. */
  orderGoodsTotal: Prisma.Decimal;
  /** F: the payment's installment fee (`Payment.installmentFeeAmount`). */
  paymentFee: Prisma.Decimal;
  /** T: the payment's goods total (`Payment.amount`). */
  paymentGoodsTotal: Prisma.Decimal;
  /**
   * Earlier refunds of the payment that took or may take money out (every
   * status but `failed`), this attempt excluded. Each has its goods part and
   * its fee share; legacy refunds without an attempt never carry a fee.
   */
  priorRefunds: readonly PriorFeeRefund[];
  /** This refund's goods part (the refund flow's amount). */
  goodsRefund: Prisma.Decimal;
}

function sumOf(rows: readonly PriorFeeRefund[]): {
  goods: Prisma.Decimal;
  fee: Prisma.Decimal;
} {
  return rows.reduce(
    (acc, row) => ({
      goods: acc.goods.plus(refundGoodsPartOf(row)),
      fee: acc.fee.plus(row.installmentFeeAmount),
    }),
    { goods: new Prisma.Decimal(0), fee: new Prisma.Decimal(0) },
  );
}

function atLeastZero(value: Prisma.Decimal): Prisma.Decimal {
  return value.isNegative() ? new Prisma.Decimal(0) : value;
}

/**
 * The installment fee (vade farkı) to give back with a refund of `goodsRefund`
 * goods money, in kuruş. THE one rule (AS-L2: change it here only):
 *
 * - the fee follows the cash refunded, pro rata per order, whatever the
 *   fault: cumulatively, `round2(F_o * goodsRefundedSoFar / T_o)` minus the
 *   fee already given back, so many partial refunds never drift;
 * - the refund that brings the order's goods refunds to T_o takes the rest of
 *   F_o, so the fee refunds of a fully refunded order sum to F_o;
 * - the refund that brings the PAYMENT's goods refunds to T takes the rest of
 *   F: a cart refund can give back a sibling's shipping with the order that
 *   closes the package, and the buyer still gets all of F back;
 * - no goods money, no fee (a zero-cash settlement); a refund that closes the
 *   order with goods money kept (return shipping charged) keeps the fee share
 *   of the money kept.
 *
 * Worked examples (plan 4.4; `k = 0`: T 1,000.00, F 54.35): full refund
 * 1,054.35; 400.00 then 600.00 -> 421.74 then 632.61; 940.00 with 60.00
 * return shipping kept -> 991.09.
 */
export function installmentFeeShareOf(
  input: InstallmentFeeShareInput,
): Prisma.Decimal {
  const zero = new Prisma.Decimal(0);
  if (!input.paymentFee.gt(0) || !input.goodsRefund.gt(0)) return zero;

  const payment = sumOf(input.priorRefunds);
  const paymentRemaining = atLeastZero(input.paymentFee.minus(payment.fee));
  if (
    payment.goods
      .plus(input.goodsRefund)
      .gte(input.paymentGoodsTotal.minus(GOODS_COMPLETION_EPSILON))
  ) {
    return paymentRemaining;
  }

  if (!input.orderFee.gt(0) || !input.orderGoodsTotal.gt(0)) return zero;
  const order = sumOf(
    input.priorRefunds.filter((row) => row.orderId === input.orderId),
  );
  const orderRemaining = Prisma.Decimal.min(
    atLeastZero(input.orderFee.minus(order.fee)),
    paymentRemaining,
  );
  const goodsSoFar = order.goods.plus(input.goodsRefund);
  if (goodsSoFar.gte(input.orderGoodsTotal.minus(GOODS_COMPLETION_EPSILON))) {
    return orderRemaining;
  }
  const shareSoFar = input.orderFee
    .times(goodsSoFar)
    .div(input.orderGoodsTotal)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return Prisma.Decimal.min(
    atLeastZero(shareSoFar.minus(order.fee)),
    orderRemaining,
  );
}

/** The client the refund claim reads the fee share inputs with. */
export interface FeeShareReader {
  payment: Pick<Prisma.TransactionClient["payment"], "findUnique">;
  order: Pick<Prisma.TransactionClient["order"], "findUnique">;
  refundAttempt: Pick<Prisma.TransactionClient["refundAttempt"], "findMany">;
}

/**
 * `installmentFeeShareOf` with its inputs read: the payment's and the
 * order's fee and the payment's earlier refunds (every order, every status
 * but `failed`, `excludeAttemptId` left out). Run it inside the refund claim
 * transaction, with the payment row locked, so two refunds never count the
 * same fee. A payment without a fee costs one query and returns 0.
 */
export async function refundFeeShareFor(
  db: FeeShareReader,
  input: {
    paymentId: string;
    orderId: string;
    orderGoodsTotal: Prisma.Decimal.Value;
    goodsRefund: Prisma.Decimal.Value;
    excludeAttemptId?: string;
  },
): Promise<Prisma.Decimal> {
  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    select: { amount: true, installmentFeeAmount: true },
  });
  if (!payment || !payment.installmentFeeAmount.gt(0)) {
    return new Prisma.Decimal(0);
  }
  const [order, priorRefunds] = await Promise.all([
    db.order.findUnique({
      where: { id: input.orderId },
      select: { installmentFeeAmount: true },
    }),
    db.refundAttempt.findMany({
      where: {
        paymentId: input.paymentId,
        orderId: { not: null },
        status: { not: RefundAttemptStatus.failed },
        ...(input.excludeAttemptId
          ? { id: { not: input.excludeAttemptId } }
          : {}),
      },
      select: { orderId: true, amount: true, installmentFeeAmount: true },
    }),
  ]);
  return installmentFeeShareOf({
    orderId: input.orderId,
    orderFee: order?.installmentFeeAmount ?? new Prisma.Decimal(0),
    orderGoodsTotal: new Prisma.Decimal(input.orderGoodsTotal),
    paymentFee: payment.installmentFeeAmount,
    paymentGoodsTotal: payment.amount,
    priorRefunds,
    goodsRefund: new Prisma.Decimal(input.goodsRefund),
  });
}

// ── Charge attempts (one per signed form, keyed by merchant_oid) ────────────

/** What the comparisons and the capture read of a charge attempt. */
export const CHARGE_ATTEMPT_AMOUNTS_SELECT = {
  id: true,
  paymentId: true,
  merchantOid: true,
  installmentCount: true,
  baseAmount: true,
  installmentFeeAmount: true,
  chargedAmount: true,
  capturedAt: true,
  // Trace tags of the capture (no card digits).
  cardFamily: true,
  buyerSegment: true,
  installmentRuleId: true,
} satisfies Prisma.PaymentChargeAttemptSelect;

export type ChargeAttemptAmounts = Prisma.PaymentChargeAttemptGetPayload<{
  select: typeof CHARGE_ATTEMPT_AMOUNTS_SELECT;
}>;

/** A client that can read charge attempts (the service or a transaction). */
export interface ChargeAttemptReader {
  paymentChargeAttempt: Pick<
    Prisma.TransactionClient["paymentChargeAttempt"],
    "findFirst" | "findMany"
  >;
}

/**
 * The charge attempt THIS payment signed under `merchantOid`, or null: a
 * form signed before attempts existed, or an oid of another payment (never
 * used for this one's amount).
 */
export function chargeAttemptByOid(
  db: ChargeAttemptReader,
  paymentId: string,
  merchantOid: string,
): Promise<ChargeAttemptAmounts | null> {
  return db.paymentChargeAttempt.findFirst({
    where: { merchantOid, paymentId },
    select: CHARGE_ATTEMPT_AMOUNTS_SELECT,
  });
}

/** The fields the expected PayTR charge falls back to. */
export interface ExpectedChargeSource extends ChargedAmountSource {
  id: string;
}

/**
 * What PayTR must report for `merchantOid` of `payment` (PSP scale): the
 * signed amount C of that oid's attempt, so a late callback of an older
 * attempt is checked against ITS amount; without an attempt the legacy rule,
 * `chargedAmountOf(payment)` (= `amount` until a capture writes C).
 */
export async function expectedPaytrChargeFor(
  db: ChargeAttemptReader,
  payment: ExpectedChargeSource,
  merchantOid: string,
): Promise<Prisma.Decimal> {
  return expectedPaytrChargeOf(
    payment,
    await chargeAttemptByOid(db, payment.id, merchantOid),
  );
}

/**
 * The rule of `expectedPaytrChargeFor` once the oid's attempt was read: its
 * signed amount, else the payment's charged amount (legacy: `amount`).
 */
export function expectedPaytrChargeOf(
  payment: ChargedAmountSource,
  attempt: Pick<ChargeAttemptAmounts, "chargedAmount"> | null,
): Prisma.Decimal {
  return attempt ? attempt.chargedAmount : chargedAmountOf(payment);
}

/**
 * `expectedPaytrChargeFor` for every oid of a payment with one query: the
 * sweeps that ask PayTR about each oid (current and superseded) of a payment.
 */
export async function paytrChargeExpectationsOf(
  db: ChargeAttemptReader,
  payment: ExpectedChargeSource,
): Promise<(merchantOid: string) => Prisma.Decimal> {
  const attempts = await db.paymentChargeAttempt.findMany({
    where: { paymentId: payment.id },
    select: { merchantOid: true, chargedAmount: true },
  });
  const byOid = new Map(attempts.map((a) => [a.merchantOid, a]));
  return (merchantOid) =>
    expectedPaytrChargeOf(payment, byOid.get(merchantOid) ?? null);
}

/**
 * `paytrChargeExpectationsOf` for a batch of payments with ONE query: the
 * sweeps read the attempts of every candidate up front instead of one query
 * per candidate. An attempt is used only for the payment that signed it.
 */
export async function paytrChargeExpectationsForPayments(
  db: ChargeAttemptReader,
  payments: readonly ExpectedChargeSource[],
): Promise<
  (payment: ExpectedChargeSource, merchantOid: string) => Prisma.Decimal
> {
  const attempts = payments.length
    ? await db.paymentChargeAttempt.findMany({
        where: { paymentId: { in: payments.map((p) => p.id) } },
        select: { paymentId: true, merchantOid: true, chargedAmount: true },
      })
    : [];
  const byPaymentOid = new Map(
    attempts.map((a) => [`${a.paymentId}\u0000${a.merchantOid}`, a]),
  );
  return (payment, merchantOid) =>
    expectedPaytrChargeOf(
      payment,
      byPaymentOid.get(`${payment.id}\u0000${merchantOid}`) ?? null,
    );
}

// ── The one comparison rule ─────────────────────────────────────────────────

type AmountValue = Prisma.Decimal | number | string;

function decimalOrNull(value: AmountValue): Prisma.Decimal | null {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "string" && !/^-?\d+(\.\d+)?$/.test(value.trim())) {
    return null;
  }
  return new Prisma.Decimal(value);
}

/**
 * Does a PayTR-reported amount in TL (status inquiry, statement line) match
 * the expected PSP-scale amount within `toleranceTl`? A value that is not a
 * number never matches (fail closed: the payment is not completed and the
 * mismatch is logged by the caller).
 */
export function paytrAmountMatches(
  reportedTl: AmountValue,
  expected: AmountValue,
  toleranceTl: number,
): boolean {
  const reported = decimalOrNull(reportedTl);
  const ours = decimalOrNull(expected);
  if (!reported || !ours) return false;
  return reported.minus(ours).abs().lte(toleranceTl);
}

/** `paytrAmountMatches` for the callback's `total_amount` in kuruş ("106638"). */
export function paytrKurusMatches(
  reportedKurus: string | number,
  expected: AmountValue,
  toleranceTl: number,
): boolean {
  const text = String(reportedKurus).trim();
  if (!/^\d+$/.test(text)) return false;
  return paytrAmountMatches(
    new Prisma.Decimal(text).div(100),
    expected,
    toleranceTl,
  );
}

/** A TL amount in whole kuruş, half up (the PSP scale PayTR reports in). */
function kurusOf(value: Prisma.Decimal): Prisma.Decimal {
  return value.times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Does a charge PayTR collected (`charged`, PSP scale) cover `required`,
 * compared in whole kuruş? The capture of an attempt that cannot be linked
 * completes the payment only when it does: a charge below the payment's
 * amount is an under-collection, never a paid order. Anything that is not
 * an amount does not cover (fail closed).
 */
export function paytrChargeCovers(
  charged: AmountValue,
  required: AmountValue,
): boolean {
  const collected = decimalOrNull(charged);
  const needed = decimalOrNull(required);
  if (!collected || !needed) return false;
  return kurusOf(collected).gte(kurusOf(needed));
}
