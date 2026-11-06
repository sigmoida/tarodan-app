/** @format */

import {
  INSTALLMENT_COUNT_MAX,
  type DirectFormInstallmentSelection,
  type InstallmentOption,
  type InstallmentOptionsCard,
  type InstallmentOptionsReason,
  type InstallmentOptionsResponse,
  type PaymentInstallmentFields,
  type PaymentsInstallmentsConfig,
} from "@tarodan/types";
import type { PaymentKind } from "@/lib/paymentKind";

/**
 * Installment payments on the card form (tarodan-ops ADR 0019, plan 5.1):
 * the pure rules the selector, the options hook and the `direct-form` body
 * share. Every amount comes from the server
 * (`POST /payments/installment-options`); nothing here computes money.
 *
 * Same names and behaviour as the mobile M1 module
 * (`tarodan-mobile/src/lib/payment/installments.ts`), so both platforms read
 * an answer and refuse a signing the same way.
 *
 * PCI: the only card data that may reach our API is the BIN, the first 8
 * digits of a new card. `installmentBinOf` is the one place that cuts it; the
 * full number goes only into the form posted to PayTR.
 */

/** Digits of a new card the options call needs (the API takes 6 to 8; 8 pins the family). */
export const INSTALLMENT_BIN_LENGTH = 8;

/** Typing pause before the options call (plan 5.1: 300 ms). */
export const INSTALLMENT_OPTIONS_DEBOUNCE_MS = 300;

/** The card the options are priced for: a new card's BIN or a saved card. */
export type InstallmentCardSource =
  { kind: "bin"; bin: string } | { kind: "saved"; savedCardId: string };

/** First 8 digits of a typed card number, or `null` until 8 digits exist. Never more. */
export function installmentBinOf(cardNumber: string): string | null {
  const digits = cardNumber.replace(/\D/g, "");
  return digits.length >= INSTALLMENT_BIN_LENGTH
    ? digits.slice(0, INSTALLMENT_BIN_LENGTH)
    : null;
}

/** Stable identity of a card source (query key part; a change resets the choice). */
export function installmentSourceKey(
  source: InstallmentCardSource | null,
): string | null {
  if (!source) return null;
  return source.kind === "bin"
    ? `bin:${source.bin}`
    : `saved:${source.savedCardId}`;
}

/** The installment part of `GET /payments/config`, read fail-closed. */
export const INSTALLMENTS_OFF: PaymentsInstallmentsConfig = {
  enabled: false,
  minAmount: 0,
};

/**
 * Only an explicit `enabled: true` with a finite, non-negative `minAmount`
 * turns installments on. An older API (no field), a malformed value or a
 * failed config call means no selector, exactly as before.
 */
export function installmentsConfigOf(
  config:
    { installments?: Partial<PaymentsInstallmentsConfig> } | null | undefined,
): PaymentsInstallmentsConfig {
  const raw = config?.installments;
  const minAmount =
    typeof raw?.minAmount === "number" ? raw.minAmount : Number.NaN;
  if (raw?.enabled !== true || !Number.isFinite(minAmount) || minAmount < 0) {
    return INSTALLMENTS_OFF;
  }
  return { enabled: true, minAmount };
}

/** What a payment target holds (the card form's `PaymentTarget`). */
export interface InstallmentTarget {
  orderId?: string;
  checkoutGroupId?: string;
  tradeId?: string;
}

/**
 * Whether the card form shows the selector, before any call:
 *
 * - `off`: the switch is off (or the API is older), or a payment kind D6
 *   excludes: membership, boost, trade cash. No selector at all; the server
 *   refuses them too (`not_offered_for_payment`).
 * - `belowMinimum`: the goods total the screen shows is under the minimum.
 *   The one-line note is shown (plan 6.2), no call is made.
 * - `on`: price the card once it is known.
 *
 * `target` is null on the single-page checkout, where the cart group exists
 * only after submit.
 */
export type InstallmentGate = "off" | "belowMinimum" | "on";

export function installmentGateOf(input: {
  config: PaymentsInstallmentsConfig;
  kind: PaymentKind;
  /** Goods total T in TL; unknown = off. */
  amount: number | undefined;
  target: InstallmentTarget | null;
}): InstallmentGate {
  const { config, kind, amount, target } = input;
  if (!config.enabled || kind !== "checkout") return "off";
  if (target) {
    if (target.tradeId) return "off";
    if (!target.orderId && !target.checkoutGroupId) return "off";
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return "off";
  }
  return amount < config.minAmount ? "belowMinimum" : "on";
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidOption(option: unknown): option is InstallmentOption {
  const o = option as Partial<InstallmentOption> | null | undefined;
  return (
    !!o &&
    Number.isInteger(o.count) &&
    (o.count as number) >= 1 &&
    (o.count as number) <= INSTALLMENT_COUNT_MAX &&
    isMoney(o.totalAmount) &&
    o.totalAmount > 0 &&
    isMoney(o.feeAmount) &&
    isMoney(o.monthlyAmount)
  );
}

/** What the selector shows for one options answer (or a failed call). */
export type InstallmentOffer =
  /** Options to choose from: single payment first, then at least one count above 1. */
  | {
      kind: "options";
      options: InstallmentOption[];
      card?: InstallmentOptionsCard;
    }
  /** Single payment only, with the one-line reason (plan 6.6). */
  | {
      kind: "single";
      reason: Exclude<InstallmentOptionsReason, "disabled">;
      minAmount?: number;
    }
  /** The switch went off between the config and this call: no selector. */
  | { kind: "hidden" };

/**
 * Reads an options answer fail-closed. A malformed option is dropped; without
 * a valid single payment and at least one valid count above 1 the buyer gets
 * the single payment with the `unavailable` note.
 */
export function installmentOfferOf(
  response: InstallmentOptionsResponse | null | undefined,
): InstallmentOffer {
  if (!response || typeof response !== "object") {
    return { kind: "single", reason: "unavailable" };
  }
  if (response.reason === "disabled") return { kind: "hidden" };
  if (!response.enabled) {
    const reason = response.reason ?? "unavailable";
    if (reason === "below_minimum") {
      return isMoney(response.minAmount)
        ? { kind: "single", reason, minAmount: response.minAmount }
        : { kind: "single", reason: "not_offered_for_payment" };
    }
    return { kind: "single", reason };
  }
  const options = (
    Array.isArray(response.options) ? response.options : []
  ).filter(isValidOption);
  const single = options.find((o) => o.count === 1);
  const counts = options
    .filter((o) => o.count > 1)
    .filter((o, i, list) => list.findIndex((x) => x.count === o.count) === i)
    .sort((a, b) => a.count - b.count);
  if (!single || counts.length === 0) {
    return { kind: "single", reason: "unavailable" };
  }
  return { kind: "options", options: [single, ...counts], card: response.card };
}

/**
 * The `installment` field of `direct-form` (A4 contract): sent only for a
 * count above 1, with the total the buyer saw as `expectedTotal`; a new card
 * adds its BIN, a saved card never does (the API refuses `bin` next to
 * `savedCardId`). Absent = single payment, exactly as before.
 */
export function installmentSelectionOf(
  option: InstallmentOption | null | undefined,
  source: InstallmentCardSource | null,
): DirectFormInstallmentSelection | undefined {
  if (!option || option.count <= 1 || !source) return undefined;
  return {
    count: option.count,
    ...(source.kind === "bin" ? { bin: source.bin } : {}),
    expectedTotal: option.totalAmount,
  };
}

/** `direct-form` refusals the card form handles itself (A4 contract). */
export type InstallmentSigningError =
  "pricingChanged" | "unavailable" | "notOffered" | "amountOutOfDate";

const SIGNING_ERRORS: Record<string, InstallmentSigningError> = {
  "server.payment.installmentPricingChanged": "pricingChanged",
  "server.payment.installmentUnavailable": "unavailable",
  "server.payment.installmentNotOffered": "notOffered",
  "server.payment.paymentAmountOutOfDate": "amountOutOfDate",
};

export function installmentSigningErrorOf(
  error: unknown,
): InstallmentSigningError | null {
  const key = (error as { response?: { data?: { i18nKey?: unknown } } } | null)
    ?.response?.data?.i18nKey;
  return typeof key === "string" ? (SIGNING_ERRORS[key] ?? null) : null;
}

/** "world" -> "World": PayTR names families in lower case; the bank is shown as sent. */
export function installmentCardLine(
  card: InstallmentOptionsCard | undefined,
): string {
  const family = card?.family
    ? card.family.charAt(0).toUpperCase() + card.family.slice(1)
    : "";
  return [card?.bank, family].filter(Boolean).join(" · ");
}

/** A paid payment's installment details, or null for a single payment / older API / the seller. */
export interface PaidInstallment {
  count: number;
  /** null when the API sent no fee. */
  feeAmount: number | null;
  chargedAmount: number;
}

export function paidInstallmentOf(
  fields: PaymentInstallmentFields | null | undefined,
): PaidInstallment | null {
  const count = fields?.installmentCount;
  const charged = fields?.chargedAmount;
  if (typeof count !== "number" || !Number.isInteger(count) || count <= 1) {
    return null;
  }
  if (typeof charged !== "number" || !Number.isFinite(charged)) return null;
  const fee = fields?.installmentFeeAmount;
  return {
    count,
    feeAmount: typeof fee === "number" && Number.isFinite(fee) ? fee : null,
    chargedAmount: charged,
  };
}
