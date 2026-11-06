import { z } from "zod";
import {
  INSTALLMENT_COUNT_MAX,
  INSTALLMENT_COUNT_MIN,
  INSTALLMENT_SEGMENTS,
  installmentRuleViolationKey,
  validateInstallmentRule,
  type AdminInstallmentRule,
  type InstallmentRuleField,
  type InstallmentRuleInput,
  type InstallmentRuleViolation,
  type InstallmentRuleViolationCode,
  type InstallmentSegment,
} from "@tarodan/types";
import type { SelectOption } from "@tarodan/ui";
import { istanbulDateTimeIso, istanbulDateTimeOf } from "@/lib/istanbul-dates";
import type { Translate } from "@/lib/statusLabels";

/**
 * The installment rule form (create and new version). Every field is the
 * text the control holds; `parseRuleForm` turns it into the API input and
 * `validateInstallmentRule` from `@tarodan/types` (the validator the API
 * runs) decides what is valid, so the form never encodes a rule of its own.
 * Field names are `InstallmentRuleField`s, so a violation (client or the
 * API's 400) lands on the field it names.
 */
export interface InstallmentRuleFormValues {
  name: string;
  segment: InstallmentSegment;
  minCount: string;
  maxCount: string;
  allowed: boolean;
  /** Percent, a decimal comma or dot. */
  platformSharePct: string;
  priority: string;
  /** `YYYY-MM-DDTHH:mm`, Istanbul time. */
  validFrom: string;
  /** `YYYY-MM-DDTHH:mm`, Istanbul time; "" = open-ended. */
  validUntil: string;
}

/** The rule fields a price preview prices (the draft rule). */
export type InstallmentRuleDraft = Pick<
  InstallmentRuleInput,
  | "segment"
  | "minCount"
  | "maxCount"
  | "allowed"
  | "platformSharePct"
  | "priority"
>;

const DRAFT_FIELDS: readonly InstallmentRuleField[] = [
  "segment",
  "minCount",
  "maxCount",
  "allowed",
  "platformSharePct",
  "priority",
];

/** The installment counts a rule can cover, for the two count selects. */
export const installmentCountOptions = (): SelectOption[] =>
  Array.from(
    { length: INSTALLMENT_COUNT_MAX - INSTALLMENT_COUNT_MIN + 1 },
    (_, index) => {
      const count = String(INSTALLMENT_COUNT_MIN + index);
      return { value: count, label: count };
    },
  );

/** A new rule: every buyer, counts 2-3, offered, share 0, live from now. */
export function emptyRuleForm(
  now: Date = new Date(),
): InstallmentRuleFormValues {
  return {
    name: "",
    segment: "all",
    minCount: String(INSTALLMENT_COUNT_MIN),
    maxCount: String(INSTALLMENT_COUNT_MIN + 1),
    allowed: true,
    platformSharePct: "0",
    priority: "0",
    validFrom: istanbulDateTimeOf(now.toISOString()),
    validUntil: "",
  };
}

/** A new version starts from the values of the version it replaces. */
export function ruleToForm(
  rule: AdminInstallmentRule,
): InstallmentRuleFormValues {
  return {
    name: rule.name,
    segment: rule.segment,
    minCount: String(rule.minCount),
    maxCount: String(rule.maxCount),
    allowed: rule.allowed,
    platformSharePct: String(rule.platformSharePct).replace(".", ","),
    priority: String(rule.priority),
    validFrom: istanbulDateTimeOf(rule.validFrom),
    validUntil: istanbulDateTimeOf(rule.validUntil),
  };
}

/** A decimal typed with a comma or a dot; NaN for anything else. */
function decimalOf(text: string): number {
  const value = text.trim();
  return /^\d+([.,]\d+)?$/.test(value)
    ? Number(value.replace(",", "."))
    : Number.NaN;
}

/** A whole number with an optional sign; NaN for anything else. */
function integerOf(text: string): number {
  const value = text.trim();
  return /^[+-]?\d+$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * The API input of the form. Text that is not a number becomes NaN, which
 * the shared validator refuses on its field. Counts that are not offered
 * carry no platform share (the share field is disabled then).
 */
export function parseRuleForm(
  values: InstallmentRuleFormValues,
): InstallmentRuleInput {
  return {
    name: values.name.trim(),
    segment: values.segment,
    minCount: integerOf(values.minCount),
    maxCount: integerOf(values.maxCount),
    allowed: values.allowed,
    platformSharePct: values.allowed ? decimalOf(values.platformSharePct) : 0,
    priority: integerOf(values.priority),
    validFrom: istanbulDateTimeIso(values.validFrom),
    validUntil: values.validUntil
      ? istanbulDateTimeIso(values.validUntil)
      : null,
  };
}

/** The draft the preview prices, or null while one of its fields is invalid. */
export function draftOfRuleForm(
  values: InstallmentRuleFormValues,
): InstallmentRuleDraft | null {
  const input = parseRuleForm(values);
  const invalid = validateInstallmentRule(input).some((violation) =>
    DRAFT_FIELDS.includes(violation.field),
  );
  if (invalid) return null;
  const { segment, minCount, maxCount, allowed, platformSharePct, priority } =
    input;
  return { segment, minCount, maxCount, allowed, platformSharePct, priority };
}

/** The message of a violation: the API's catalog key, so both say the same. */
export const ruleViolationMessage = (
  t: Translate,
  violation: InstallmentRuleViolation,
) => t(installmentRuleViolationKey(violation));

export const ruleFormSchema = (t: Translate) =>
  z
    .object({
      name: z.string(),
      segment: z.enum(INSTALLMENT_SEGMENTS),
      minCount: z.string(),
      maxCount: z.string(),
      allowed: z.boolean(),
      platformSharePct: z.string(),
      priority: z.string(),
      validFrom: z.string(),
      validUntil: z.string(),
    })
    .superRefine((values, ctx) => {
      const violations = validateInstallmentRule(
        parseRuleForm(values as InstallmentRuleFormValues),
      );
      for (const violation of violations) {
        ctx.addIssue({
          code: "custom",
          path: [violation.field],
          message: ruleViolationMessage(t, violation),
        });
      }
    });

/** The field of each violation code (the same pairs the validator uses). */
const VIOLATION_FIELD = {
  nameRequired: "name",
  nameTooLong: "name",
  segmentInvalid: "segment",
  countRange: "minCount",
  shareRange: "platformSharePct",
  sharePrecision: "platformSharePct",
  shareWithoutAllowed: "platformSharePct",
  priorityRange: "priority",
  validFromInvalid: "validFrom",
  validUntilInvalid: "validUntil",
  validUntilNotAfterFrom: "validUntil",
} as const satisfies Record<InstallmentRuleViolationCode, InstallmentRuleField>;

const RULE_KEY_PREFIX = "server.admin.installments.rule.";

/**
 * The form field an API 400 names (`server.admin.installments.rule.<code>`),
 * or null for another error.
 */
export function ruleFieldOfErrorKey(
  key: string | null,
): InstallmentRuleField | null {
  if (!key?.startsWith(RULE_KEY_PREFIX)) return null;
  const code = key.slice(RULE_KEY_PREFIX.length);
  return Object.hasOwn(VIOLATION_FIELD, code)
    ? VIOLATION_FIELD[code as InstallmentRuleViolationCode]
    : null;
}

/** The API refused the write because the version is not current any more. */
export const STALE_RULE_KEYS: readonly string[] = [
  "server.admin.installments.rule.notCurrent",
  "server.admin.installments.rule.notFound",
];
