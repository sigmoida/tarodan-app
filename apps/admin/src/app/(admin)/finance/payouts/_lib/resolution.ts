import type { MessageKey } from "@tarodan/i18n";
import type {
  MarkPayoutTransferPaidBody,
  RetryPayoutTransferBody,
} from "@/lib/api/finance";
import { extractErrorI18nKey, extractErrorMessage } from "@/lib/error";
import type { PayoutTransferResolution } from "./types";

/**
 * Manual resolution of a payout transfer (retry with a PayTR panel check,
 * "Mark as paid"). What is allowed per row is the API's decision
 * (`row.resolution`); this module only shapes requests and reads errors.
 */

/** List resources a resolution action changes (the list and its summary). */
export const PAYOUT_TRANSFER_RESOURCES = [
  "payouts-transfers",
  "payouts-summary",
] as const;

/** The API lets only these roles retry or mark a transfer as paid. */
const RESOLVER_ROLES: readonly string[] = ["super_admin", "admin"];

export function canResolvePayoutTransfers(role: string | null | undefined) {
  return !!role && RESOLVER_ROLES.includes(role);
}

/** A TL amount in kuruş: the unit every payout comparison uses. */
const toKurus = (value: number) => Math.round(value * 100);

/**
 * The amount an admin typed to confirm a payment, in TL, or null when it is
 * not an amount. Accepts what the panel shows (`₺1.234,56`) and plain input
 * (`1234,56`, `1234.56`, `1234`): at most two decimals.
 */
export function parseTypedAmount(input: string): number | null {
  const value = input.replace(/₺|TL|\s/gi, "");
  // Turkish grouping: 1.234 or 1.234,56
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(value)) {
    return Number(value.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d+([.,]\d{1,2})?$/.test(value)) {
    return Number(value.replace(",", "."));
  }
  return null;
}

/** Whether the typed amount is the net to the kuruş. */
export function typedAmountMatches(input: string, net: number): boolean {
  const typed = parseTypedAmount(input);
  return typed !== null && toKurus(typed) === toKurus(net);
}

/** Retry body: empty for a plain retry; the panel check and reason when the
 *  row requires them. */
export function retryTransferBody(
  checked?: { reason?: string } | null,
): RetryPayoutTransferBody {
  return checked
    ? { confirmProviderChecked: true, reason: (checked.reason ?? "").trim() }
    : {};
}

/**
 * "Mark as paid" body. The method and the net come from the row the admin
 * reviewed, never from input: the API refuses (409) when either changed
 * since. Null when the row offers no mark-paid method.
 */
export function markPaidBody(
  resolution: PayoutTransferResolution | null | undefined,
  values: {
    reference?: string;
    reason?: string;
    confirmProviderChecked?: boolean;
  },
): MarkPayoutTransferPaidBody | null {
  if (!resolution?.markPaidMethod || resolution.markPaidNetAmount == null) {
    return null;
  }
  return {
    method: resolution.markPaidMethod,
    reference: (values.reference ?? "").trim(),
    reason: (values.reason ?? "").trim(),
    expectedNetAmount: resolution.markPaidNetAmount,
    // Sent only when the row asks for it (the schema made it checked).
    ...(resolution.markPaidRequiresProviderCheck
      ? { confirmProviderChecked: values.confirmProviderChecked === true }
      : {}),
  };
}

/** The error keys of the payout resolution endpoints. */
export type PayoutActionErrorKey = Extract<
  MessageKey,
  `server.admin.payout.${string}`
>;

/** What the panel does with each error besides showing it:
 *  `refresh` = the row changed or the list was stale: reload it and close
 *  the dialog; `field` = the input is missing: mark that field. */
interface PayoutActionErrorHandling {
  refresh: boolean;
  field?: "reference" | "reason";
}

export const PAYOUT_ACTION_ERRORS: Record<
  PayoutActionErrorKey,
  PayoutActionErrorHandling
> = {
  "server.admin.payout.transferNotFound": { refresh: true },
  "server.admin.payout.retryStateInvalid": { refresh: true },
  // A plain retry of a row the list showed before its outcome became
  // unknown: the reloaded row asks for the panel check.
  "server.admin.payout.providerCheckRequired": { refresh: true },
  "server.admin.payout.transferStateChanged": { refresh: true },
  "server.admin.payout.referenceRequired": {
    refresh: false,
    field: "reference",
  },
  "server.admin.payout.reasonRequired": { refresh: false, field: "reason" },
  "server.admin.payout.markPaidNotAllowed": { refresh: true },
  "server.admin.payout.markPaidMissingInput": { refresh: true },
  "server.admin.payout.markPaidAmountChanged": { refresh: true },
  "server.admin.payout.markPaidPayoutBlocked": { refresh: true },
  // The row gained the panel-check requirement after the list loaded: the
  // reloaded row shows the checkbox.
  "server.admin.payout.markPaidProviderCheckRequired": { refresh: true },
};

export interface PayoutActionError extends PayoutActionErrorHandling {
  /** The API's message (already in the admin's language, with the current
   *  amount or state filled in), or the fallback. */
  message: string;
  key: PayoutActionErrorKey | null;
}

/** Reads a failed resolution request: its message and what to do next. */
export function payoutActionError(
  error: unknown,
  fallback: string,
): PayoutActionError {
  const raw = extractErrorI18nKey(error);
  const key =
    raw && Object.hasOwn(PAYOUT_ACTION_ERRORS, raw)
      ? (raw as PayoutActionErrorKey)
      : null;
  return {
    key,
    message: extractErrorMessage(error, fallback),
    ...(key ? PAYOUT_ACTION_ERRORS[key] : { refresh: false }),
  };
}
