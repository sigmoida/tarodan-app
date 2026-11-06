/**
 * Installment payments ("taksit", tarodan-ops ADR 0019): the contract the API,
 * web, admin and mobile share. Request and response shapes, the buyer
 * segments, the two admin settings and the rule validator live here once; the
 * API stays authoritative (it re-validates every write).
 */

import { isPlatformSettingOn } from "./platform-setting";

/** Installment counts besides a single payment (PayTR `installment_count`). */
export const INSTALLMENT_COUNT_MIN = 2;
export const INSTALLMENT_COUNT_MAX = 12;

// ── Segments ────────────────────────────────────────────────────────────────

/**
 * The buyer segment an installment rule targets. A logged-in buyer's segment
 * is the effective membership tier; a guest purchase is `guest`; `all`
 * matches every buyer, guests included. Mirrors the Prisma enum
 * `InstallmentSegment`.
 */
export const INSTALLMENT_SEGMENTS = [
  "all",
  "guest",
  "free",
  "basic",
  "premium",
  "business",
] as const;
export type InstallmentSegment = (typeof INSTALLMENT_SEGMENTS)[number];

/** A buyer's own segment: every segment except the `all` wildcard. */
export type InstallmentBuyerSegment = Exclude<InstallmentSegment, "all">;

export function isInstallmentSegment(
  value: unknown,
): value is InstallmentSegment {
  return (
    typeof value === "string" &&
    (INSTALLMENT_SEGMENTS as readonly string[]).includes(value)
  );
}

// ── Buyer options (`POST /payments/installment-options`) ──────────────────

/**
 * Request: exactly one of `bin` | `savedCardId`, exactly one of
 * `paymentId` | `amount`. `amount` mode (web single-page checkout, before the
 * order exists) only prices what that client displays; the signed amount is
 * always recomputed from the payment row at `direct-form`.
 */
export interface InstallmentOptionsRequest {
  /** First 6 to 8 card digits, digits only. Never more. */
  bin?: string;
  savedCardId?: string;
  paymentId?: string;
  /** Goods total T in TL (two decimals). */
  amount?: number;
}

/** Why only a single payment is offered. */
export const INSTALLMENT_OPTIONS_REASONS = [
  "disabled",
  "not_offered_for_payment",
  "card_not_eligible",
  "below_minimum",
  "unavailable",
] as const;
export type InstallmentOptionsReason =
  (typeof INSTALLMENT_OPTIONS_REASONS)[number];

export interface InstallmentOption {
  /** 1 = single payment. */
  count: number;
  /** C: what the card is charged. */
  totalAmount: number;
  /** F = C - T: the installment fee (vade farkı), VAT included. */
  feeAmount: number;
  /** C / count; the bank rounds the installments when `feeAmount` is 0. */
  monthlyAmount: number;
}

export interface InstallmentOptionsCard {
  bank?: string;
  family?: string;
  type?: "credit" | "debit";
}

export interface InstallmentOptionsResponse {
  /** false: show the single payment only (`options` holds just count 1). */
  enabled: boolean;
  reason?: InstallmentOptionsReason;
  card?: InstallmentOptionsCard;
  /** T: the goods total every option is priced from. */
  baseAmount: number;
  /** Set when `reason` is `below_minimum`. */
  minAmount?: number;
  /**
   * Count 1 first, then ascending. A count above 1 with `feeAmount` 0 is
   * shown as "no installment fee"; never assume `feeAmount > 0`.
   */
  options: InstallmentOption[];
}

/** `GET /payments/config` -> `installments` (additive field). */
export interface PaymentsInstallmentsConfig {
  enabled: boolean;
  minAmount: number;
}

// ── Signing (`POST /payments/direct-form` -> `installment`) ───────────────

/**
 * The installment the buyer chose, sent with `direct-form` (optional: an old
 * client sends nothing and pays in a single payment). The server prices the
 * count again from the payment row, the same rates, rules and settings, and
 * signs that amount; `expectedTotal` is the `totalAmount` the client showed,
 * and a different server total is a 409
 * `server.payment.installmentPricingChanged` (refetch the options), never a
 * different charge.
 */
export interface DirectFormInstallmentSelection {
  /** 1 = single payment, else 2..12 (`INSTALLMENT_COUNT_MAX`). */
  count: number;
  /**
   * First 6 to 8 digits of a NEW card; required for a count above 1 without
   * a saved card, refused together with `savedCardId`.
   */
  bin?: string;
  /** C in TL, two decimals: the option's `totalAmount`. */
  expectedTotal: number;
}

/**
 * The installment fields of a payment in the payer's own views
 * (`GET /payments/:id/status`, `GET /payments/my-payments`, the order detail
 * payment block). Additive and optional: absent for other viewers (the
 * seller) and on old API versions. `chargedAmount` is what the card was
 * charged: `amount` plus `installmentFeeAmount`.
 */
export interface PaymentInstallmentFields {
  /** 1 = single payment. */
  installmentCount?: number;
  /** F: the installment fee (vade farkı) paid, VAT included; 0 when single. */
  installmentFeeAmount?: number;
  /** C: the amount charged to the card. */
  chargedAmount?: number;
  /** PayTR card family of the captured charge, e.g. `world`. */
  cardFamily?: string;
  /** Issuing bank of the captured charge, as PayTR names it. */
  cardBank?: string;
}

// ── Settings (PlatformSetting rows) ───────────────────────────────────────

/**
 * The two installment settings. A missing row means the default: off, and a
 * minimum of 500 TL. The generic `PATCH /admin/settings` refuses these keys;
 * they are written only through `PATCH /admin/installments/settings`
 * (validation and audit in one place). There is no max-count setting: the
 * counts come from PayTR (`max_inst_non_bus` and the family rates).
 */
export const INSTALLMENT_SETTINGS = {
  enabled: {
    key: "installments_enabled",
    default: false,
  },
  minAmount: {
    key: "installment_min_amount",
    /** TL, on the goods total T. */
    default: 500,
    min: 0,
    max: 1_000_000,
    decimals: 2,
  },
} as const;

export function isInstallmentSettingKey(settingKey: string): boolean {
  return (
    settingKey === INSTALLMENT_SETTINGS.enabled.key ||
    settingKey === INSTALLMENT_SETTINGS.minAmount.key
  );
}

/** Off unless the row says "true" (the shared on/off rule). */
export function parseInstallmentsEnabled(
  value: string | null | undefined,
): boolean {
  return isPlatformSettingOn(value);
}

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

export type InstallmentMinAmountViolation =
  | { code: "notANumber" }
  | { code: "outOfRange"; min: number; max: number }
  | { code: "tooManyDecimals"; decimals: number };

export function validateInstallmentMinAmount(
  value: number,
): InstallmentMinAmountViolation | null {
  const { min, max, decimals } = INSTALLMENT_SETTINGS.minAmount;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { code: "notANumber" };
  }
  if (value < min || value > max) return { code: "outOfRange", min, max };
  if (!hasAtMostDecimals(value, decimals)) {
    return { code: "tooManyDecimals", decimals };
  }
  return null;
}

/**
 * The stored minimum amount; the default when the row is missing or does not
 * hold a valid amount (it is only written through the validated endpoint).
 */
export function parseInstallmentMinAmount(
  value: string | null | undefined,
): number {
  const text = value?.trim();
  if (!text || !/^\d+(\.\d+)?$/.test(text)) {
    return INSTALLMENT_SETTINGS.minAmount.default;
  }
  const amount = Number(text);
  return validateInstallmentMinAmount(amount) === null
    ? amount
    : INSTALLMENT_SETTINGS.minAmount.default;
}

// ── Segment rules (admin) ───────────────────────────────────────────────────

export const INSTALLMENT_RULE_NAME_MAX = 120;
export const INSTALLMENT_RULE_PRIORITY_MIN = -1000;
export const INSTALLMENT_RULE_PRIORITY_MAX = 1000;
export const INSTALLMENT_RULE_SHARE_DECIMALS = 2;

/** One rule as the admin form and the API write endpoints take it. */
export interface InstallmentRuleInput {
  name: string;
  segment: InstallmentSegment;
  /** Inclusive, 2..12. */
  minCount: number;
  maxCount: number;
  /** false: the counts are not offered to the segment. */
  allowed: boolean;
  /** 0..100, two decimals; 0 when `allowed` is false. */
  platformSharePct: number;
  /** Higher wins. */
  priority: number;
  /** ISO time, inclusive. */
  validFrom: string;
  /** ISO time, exclusive; null or absent = open-ended. */
  validUntil?: string | null;
}

export type InstallmentRuleField = keyof InstallmentRuleInput;

export type InstallmentRuleViolationCode =
  | "nameRequired"
  | "nameTooLong"
  | "segmentInvalid"
  | "countRange"
  | "shareRange"
  | "sharePrecision"
  | "shareWithoutAllowed"
  | "priorityRange"
  | "validFromInvalid"
  | "validUntilInvalid"
  | "validUntilNotAfterFrom";

export interface InstallmentRuleViolation {
  code: InstallmentRuleViolationCode;
  field: InstallmentRuleField;
}

function isIsoTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * Every rule of a rule version (the DB CHECKs repeat the count and share
 * bounds). Empty = valid. The admin form shows each violation on its field;
 * the API answers 400 with the first one.
 */
export function validateInstallmentRule(
  input: InstallmentRuleInput,
): InstallmentRuleViolation[] {
  const violations: InstallmentRuleViolation[] = [];
  const add = (
    code: InstallmentRuleViolationCode,
    field: InstallmentRuleField,
  ) => violations.push({ code, field });

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0) add("nameRequired", "name");
  else if (name.length > INSTALLMENT_RULE_NAME_MAX) add("nameTooLong", "name");

  if (!isInstallmentSegment(input.segment)) add("segmentInvalid", "segment");

  const { minCount, maxCount } = input;
  if (
    !Number.isInteger(minCount) ||
    !Number.isInteger(maxCount) ||
    minCount < INSTALLMENT_COUNT_MIN ||
    maxCount > INSTALLMENT_COUNT_MAX ||
    minCount > maxCount
  ) {
    add("countRange", "minCount");
  }

  const share = input.platformSharePct;
  if (
    typeof share !== "number" ||
    !Number.isFinite(share) ||
    share < 0 ||
    share > 100
  ) {
    add("shareRange", "platformSharePct");
  } else if (!hasAtMostDecimals(share, INSTALLMENT_RULE_SHARE_DECIMALS)) {
    add("sharePrecision", "platformSharePct");
  } else if (input.allowed === false && share !== 0) {
    add("shareWithoutAllowed", "platformSharePct");
  }

  if (
    !Number.isInteger(input.priority) ||
    input.priority < INSTALLMENT_RULE_PRIORITY_MIN ||
    input.priority > INSTALLMENT_RULE_PRIORITY_MAX
  ) {
    add("priorityRange", "priority");
  }

  const fromValid = isIsoTime(input.validFrom);
  if (!fromValid) add("validFromInvalid", "validFrom");
  if (input.validUntil !== undefined && input.validUntil !== null) {
    if (!isIsoTime(input.validUntil)) add("validUntilInvalid", "validUntil");
    else if (
      fromValid &&
      Date.parse(input.validUntil) <= Date.parse(input.validFrom)
    ) {
      add("validUntilNotAfterFrom", "validUntil");
    }
  }
  return violations;
}

/** Catalog key of a rule violation: the API 400 and the admin form share it. */
export type InstallmentRuleViolationMessageKey =
  `server.admin.installments.rule.${InstallmentRuleViolationCode}`;

export function installmentRuleViolationKey(
  violation: InstallmentRuleViolation,
): InstallmentRuleViolationMessageKey {
  return `server.admin.installments.rule.${violation.code}`;
}

export const INSTALLMENT_RULE_STATUSES = [
  "active",
  "scheduled",
  "expired",
  "archived",
] as const;
export type InstallmentRuleStatus = (typeof INSTALLMENT_RULE_STATUSES)[number];

/** The fields that decide whether a rule version applies at a time. */
export interface InstallmentRuleWindow {
  validFrom: string | Date;
  validUntil?: string | Date | null;
  archivedAt?: string | Date | null;
}

function timeOf(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** Status of a rule version at `now` (archived wins over the window). */
export function installmentRuleStatusOf(
  rule: InstallmentRuleWindow,
  now: Date = new Date(),
): InstallmentRuleStatus {
  if (rule.archivedAt) return "archived";
  const at = now.getTime();
  if (timeOf(rule.validFrom) > at) return "scheduled";
  if (rule.validUntil && timeOf(rule.validUntil) <= at) return "expired";
  return "active";
}

/** The fields the overlap warning compares. */
export interface InstallmentRuleOverlapSubject extends InstallmentRuleWindow {
  segment: InstallmentSegment;
  priority: number;
  minCount: number;
  maxCount: number;
}

/**
 * Two unarchived rule versions that can both match one buyer for one count at
 * one time, with the same priority: the tie-break (specific segment over
 * `all`, then the newest) decides between them. Allowed, but the admin is
 * warned. `all` overlaps every segment.
 */
export function installmentRulesOverlap(
  a: InstallmentRuleOverlapSubject,
  b: InstallmentRuleOverlapSubject,
): boolean {
  if (a.archivedAt || b.archivedAt) return false;
  if (a.priority !== b.priority) return false;
  const segmentsMeet =
    a.segment === b.segment || a.segment === "all" || b.segment === "all";
  if (!segmentsMeet) return false;
  if (a.maxCount < b.minCount || b.maxCount < a.minCount) return false;
  const aEnd = a.validUntil ? timeOf(a.validUntil) : Number.POSITIVE_INFINITY;
  const bEnd = b.validUntil ? timeOf(b.validUntil) : Number.POSITIVE_INFINITY;
  return timeOf(a.validFrom) < bEnd && timeOf(b.validFrom) < aEnd;
}

// ── Admin API (`/admin/installments/*`) ─────────────────────────────────────

/** One rule version as the admin list shows it. */
export interface AdminInstallmentRule {
  id: string;
  lineageId: string;
  version: number;
  name: string;
  segment: InstallmentSegment;
  minCount: number;
  maxCount: number;
  allowed: boolean;
  platformSharePct: number;
  priority: number;
  validFrom: string;
  validUntil: string | null;
  /** AdminUser id of the author. */
  createdBy: string;
  createdAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  status: InstallmentRuleStatus;
}

export interface AdminInstallmentRuleRef {
  id: string;
  lineageId: string;
  version: number;
  name: string;
}

/** Create, new version and archive answers. */
export interface AdminInstallmentRuleWriteResponse {
  rule: AdminInstallmentRule;
  /** Unarchived versions the rule overlaps (same priority); a warning only. */
  overlaps: AdminInstallmentRuleRef[];
}

export interface AdminInstallmentRatesInfo {
  /** Latest snapshot of the marketplace store; null when none exists. */
  rateSnapshotId: string | null;
  fetchedAt: string | null;
  /** Younger than the 36 h freshness limit: usable for pricing. */
  fresh: boolean;
  maxInstallmentNonBusiness: number | null;
  /** Card families present in the snapshot. */
  families: string[];
}

/** `GET` / `PATCH /admin/installments/settings`. */
export interface AdminInstallmentSettings {
  enabled: boolean;
  minAmount: number;
  rates: AdminInstallmentRatesInfo;
}

export interface AdminInstallmentSettingsPatch {
  enabled?: boolean;
  minAmount?: number;
}

/** One count of the admin price preview. */
export interface AdminInstallmentPreviewRow {
  count: number;
  /** false: a rule disallows the count for the segment (no price). */
  offered: boolean;
  totalAmount: number | null;
  feeAmount: number | null;
  monthlyAmount: number | null;
  /** P: what the platform keeps less than on a single payment. */
  platformCostAmount: number | null;
  platformSharePct: number;
  /** Winning rule version; null = the default (buyer pays all); "draft" = the previewed draft. */
  ruleId: string | null;
}

/** `GET /admin/installments/preview`. */
export interface AdminInstallmentPreviewResponse {
  segment: InstallmentSegment;
  family: string;
  baseAmount: number;
  rateSnapshotId: string | null;
  fetchedAt: string | null;
  /** Set when no option can be priced (no fresh rates, unknown family). */
  reason?: "unavailable" | "card_not_eligible";
  rows: AdminInstallmentPreviewRow[];
}

// ── Admin payment detail (`GET /admin/payments/:id` -> `installment`) ───────

/** One signed PayTR form (merchant_oid) of a payment, read-only. */
export interface AdminPaymentChargeAttempt {
  id: string;
  merchantOid: string;
  /** 1 = single payment. */
  installmentCount: number;
  /** C: the signed amount. */
  chargedAmount: number;
  /** F of the attempt; 0 when single. */
  installmentFeeAmount: number;
  /** When PayTR's charge of this oid was captured; null = never captured. */
  capturedAt: string | null;
  createdAt: string;
}

/**
 * Pricing evidence of the captured charge attempt: the snapshot taken at
 * signing, never today's rules or rates. Never carries the BIN or the saved
 * card.
 */
export interface AdminPaymentInstallmentPricing {
  merchantOid: string;
  buyerSegment: InstallmentSegment;
  /** The winning rule version; null = the default (buyer pays all). */
  rule: AdminInstallmentRuleRef | null;
  /** Platform share of the installment cost, 0-100. */
  platformSharePct: number;
  /** P: the expected platform installment cost under that share. */
  platformCostAmount: number;
  cardFamily: string | null;
  cardBank: string | null;
  cardType: "credit" | "debit" | null;
  businessCard: boolean | null;
}

/**
 * The installment block of the admin payment detail (plan 6.4). Count, fee
 * and charged amount come from the payment (written at capture, so a pending
 * payment reads as a single payment of `goodsAmount`); `pricing` from its
 * captured attempt.
 */
export interface AdminPaymentInstallment {
  /** 1 = single payment. */
  installmentCount: number;
  /** T: the goods-scale amount (`Payment.amount`). */
  goodsAmount: number;
  /** F: the installment fee the buyer paid; 0 when single. */
  installmentFeeAmount: number;
  /** C = T + F: what PayTR charged. */
  chargedAmount: number;
  /** null: a legacy payment or one not captured through an attempt. */
  pricing: AdminPaymentInstallmentPricing | null;
  /** Every signed form of the payment, newest first. */
  chargeAttempts: AdminPaymentChargeAttempt[];
}
