import { Prisma } from "@prisma/client";

/**
 * Installment constants and the assumptions they encode (tarodan-ops plan
 * 2026-11-03, section 12.6). Each assumption that a PayTR, accountant or
 * legal answer can overturn has its ONE place here; the formula, the options
 * and the signing read it from this module only.
 */

/**
 * AS-F1: the installment fee is platform service revenue, invoiced to the
 * buyer VAT INCLUDED at 20%, so k = v / (1 + v) = 1/6 of F is VAT. "Not
 * VAT-able" would be 0 here. Snapshotted per charge attempt
 * (`feeVatRatePct`), so a change never reprices a past payment.
 */
export const INSTALLMENT_FEE_VAT_RATE_PCT = new Prisma.Decimal(20);

/*
 * The invoicing assumptions of the fee document (`buyer_installment_fee`,
 * task A6) live where the code that applies them is, one place each:
 *
 * - AS-F1 rate: the constant above, read by the invoice from the attempt.
 * - Line text "Taksit vade farkı" (and its return line): `LINE_DESCRIPTION`
 *   in `invoicing/invoice/invoice-line-description.ts`.
 * - AS-F2 (platform_sale gets the same separate document): the missing
 *   platform-seller exit in `InvoiceIssuingService.issueInstallmentFeeInvoice`.
 *   Putting the fee on the product invoice instead is a code change there
 *   and in the platform_sale lines and reversal, not a switch.
 * - AS-F3 (reversed by each refund's own fee share):
 *   `installmentFeeReturnOf` in `invoicing/invoice/installment-fee-basis.ts`.
 * - AS-F4 (PayTR's monthly invoice booked by hand): nothing in code.
 */

/**
 * AS-P1: a PayTR rate (`oranlar[family][count]` and the single rate) is the
 * merchant deduction in PERCENT of the charged amount. A ratio answer would
 * change only this function.
 */
export function paytrRateToRatio(ratePct: Prisma.Decimal): Prisma.Decimal {
  return ratePct.div(100);
}

/**
 * AS-P5: PayTR needs `total_amount - submerchant_amount` of each order slice
 * to cover its deduction on that slice, at the installment rate. When true, a
 * count whose deduction an order slice could not cover is not offered (the
 * keep guard). If PayTR confirms it does not need it, set this to false.
 */
export const INSTALLMENT_KEEP_GUARD_ENABLED = true;

/** A rate snapshot older than this is not priced from (plan 5.3). */
export const INSTALLMENT_RATES_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/**
 * The daily rate run alarms `INSTALLMENT_RATES_STALE` when no snapshot is
 * younger than this. Less than a day on purpose: the check runs right after
 * the daily fetch, so the newest snapshot of a run that failed is about 24 h
 * old (a little less when today's failure answered faster than yesterday's
 * success). 20 h trips on the first missed run and never after a stored one.
 */
export const INSTALLMENT_RATES_STALE_ALERT_MS = 20 * 60 * 60 * 1000;

/** Single flight of the on-demand rate fetch (Redis lock), seconds. */
export const INSTALLMENT_RATES_FETCH_LOCK_SECONDS = 30;

/**
 * PayTR BIN answers in Redis, seconds: `success` 7 days, `failed` (BIN not
 * defined, e.g. a foreign card) 1 day; an `error` or a timeout is never
 * cached.
 */
export const INSTALLMENT_BIN_CACHE_TTL_SECONDS = {
  success: 7 * 24 * 60 * 60,
  failed: 24 * 60 * 60,
} as const;

/**
 * Timeout of a PayTR call in the buyer's path: the BIN lookup (the PayTR
 * sample uses 20 s) and the on-demand rate refresh. On timeout the options
 * answer `unavailable` and the buyer pays in one.
 */
export const INSTALLMENT_PAYTR_USER_PATH_TIMEOUT_MS = 3_000;

/** `POST /payments/installment-options` per client IP, per minute. */
export const INSTALLMENT_OPTIONS_IP_LIMIT_PER_MINUTE = 30;

/** The same endpoint per `paymentId`, per minute (Redis counter). */
export const INSTALLMENT_OPTIONS_PAYMENT_LIMIT_PER_MINUTE = 20;

/**
 * The PayTR `user_basket` line of the buyer-paid installment fee, so the
 * basket sums to the signed amount (plan 5.6 "Basket"). PayTR shows basket
 * lines in its Turkish merchant panel and receipts, like the goods lines
 * ("Koleksiyon").
 */
export const INSTALLMENT_FEE_BASKET_ITEM = {
  id: "installment-fee",
  name: "Taksit vade farkı",
  category: "Hizmet",
  quantity: 1,
} as const;
