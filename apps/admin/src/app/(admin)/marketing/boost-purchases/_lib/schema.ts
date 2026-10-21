import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  BOOST_ADMIN_REASON_MAX_LENGTH,
  BOOST_ADMIN_REASON_MIN_LENGTH,
  BOOST_GRANT_MAX_DAYS,
  BOOST_GRANT_MIN_DAYS,
} from "@tarodan/types";
import {
  isOptionalTlAmountWithin,
  optionalTlAmountPayload,
  parseTlAmount,
} from "@/lib/amount-input";
import { fmtTry } from "@/lib/format";
import type {
  GrantBoostRequest,
  RefundBoostRequest,
} from "@/lib/api/marketing.types";

type T = ReturnType<typeof useTranslations<never>>;

/** The grant DTO caps the listing reference (id or listing code) at this. */
const LISTING_REF_MAX_LENGTH = 64;

/** The reason staff give for a grant, a revoke or a refund (shared limits). */
const boostReasonField = (t: T) =>
  z
    .string()
    .trim()
    .min(1, t("common.required"))
    .min(
      BOOST_ADMIN_REASON_MIN_LENGTH,
      t("validation.minLength", { min: BOOST_ADMIN_REASON_MIN_LENGTH }),
    )
    .max(
      BOOST_ADMIN_REASON_MAX_LENGTH,
      t("validation.maxLength", { max: BOOST_ADMIN_REASON_MAX_LENGTH }),
    );

/**
 * Refund and stop. `amount` is optional (empty refunds all that is left) but
 * must be above 0 and at most `max` (`refundableAmount`) when given.
 */
export const refundBoostSchema = (t: T, max: number) =>
  z.object({
    amount: z
      .string()
      .trim()
      .refine(
        (v) => isOptionalTlAmountWithin(v, max),
        t("admin.finance.payments.refundAmountInvalid", { max: fmtTry(max) }),
      ),
    reason: boostReasonField(t),
  });
export type RefundBoostValues = z.infer<ReturnType<typeof refundBoostSchema>>;

/** The refund body: an empty amount is left out (the server refunds all). */
export function refundBoostPayload(v: RefundBoostValues): RefundBoostRequest {
  const amount = optionalTlAmountPayload(v.amount);
  return {
    ...(amount !== undefined ? { amount } : {}),
    reason: v.reason.trim(),
  };
}

/**
 * True when the entered amount leaves part of the refundable amount unpaid:
 * the boost still stops, and that rest cannot be refunded later.
 */
export function isPartialRefund(v: RefundBoostValues, max: number): boolean {
  const amount = parseTlAmount(v.amount);
  return amount !== null && amount < max;
}

export const revokeBoostSchema = (t: T) =>
  z.object({ reason: boostReasonField(t) });
export type RevokeBoostValues = z.infer<ReturnType<typeof revokeBoostSchema>>;

export const grantBoostSchema = (t: T) =>
  z.object({
    productId: z
      .string()
      .trim()
      .min(1, t("common.required"))
      .max(
        LISTING_REF_MAX_LENGTH,
        t("validation.maxLength", { max: LISTING_REF_MAX_LENGTH }),
      ),
    /** Empty = no package (search priority only). */
    packageId: z.string(),
    durationDays: z
      .string()
      .trim()
      .refine(
        (v) => /^\d+$/.test(v) && Number(v) >= BOOST_GRANT_MIN_DAYS,
        t("validation.minValue", { min: BOOST_GRANT_MIN_DAYS }),
      )
      .refine(
        (v) => Number(v) <= BOOST_GRANT_MAX_DAYS,
        t("validation.maxValue", { max: BOOST_GRANT_MAX_DAYS }),
      ),
    reason: boostReasonField(t),
  });
export type GrantBoostValues = z.infer<ReturnType<typeof grantBoostSchema>>;

export const GRANT_DEFAULT_DAYS = 7;

export function grantBoostPayload(v: GrantBoostValues): GrantBoostRequest {
  return {
    productId: v.productId.trim(),
    ...(v.packageId ? { packageId: v.packageId } : {}),
    durationDays: Number(v.durationDays),
    reason: v.reason.trim(),
  };
}
