import {
  SELLER_ACTIONABLE_PAYOUT_FAILURES,
  type PayoutFailureReason,
} from "@tarodan/types";

/**
 * Payout transfer failure codes the payout processor writes. The vocabulary
 * (and its meaning) is shared with the admin panel in `@tarodan/types`
 * (`PAYOUT_FAILURE_REASONS`); this map only gives the processor named
 * constants. The stored reason is always a code: PayTR's raw answer goes to
 * `providerResponse`, never to `failureReason` or a seller e-mail.
 */
export const PAYOUT_FAILURE = {
  noBankAccount: "no_bank_account",
  invalidIbanFormat: "invalid_iban_format",
  bankDetailsRejected: "bank_details_rejected",
  providerRejected: "provider_rejected",
  transferTotalExceedsRemaining: "transfer_total_exceeds_remaining",
  transferNeedsManualDecision: "transfer_needs_manual_decision",
  providerUnreachable: "provider_unreachable",
  transferOutcomeUnknown: "transfer_outcome_unknown",
} as const satisfies Record<string, PayoutFailureReason>;

/** PayTR's only documented transfer error: "toplam transfer tutarı kalan
 *  tutardan fazla olamaz" (the total is above what the oid has left). */
const PAYTR_TOTAL_EXCEEDS_REMAINING_ERR_NO = "010";

/** Lower-case ASCII fold, so "İBAN", "IBAN" and "ıban" all read "iban". */
function fold(text: string): string {
  return text
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/** Rejections naming the payee's IBAN or name/title: the seller can fix them. */
const BANK_DETAILS_PATTERN =
  /iban|transfer_name|hesap sahibi|alici adi|unvan|\bisim\b|ad soyad/;

/**
 * Which failure a PayTR rejection (`status: "error"`) is. Only err_no 010 is
 * worth retrying: its answer depends on refunds and sibling transfers, so a
 * later attempt with a recomputed total can pass. Every other rejection is
 * final; a bank-details one is the seller's to fix.
 */
export function classifyTransferRejection(result: {
  err_no?: unknown;
  err_msg?: unknown;
}): PayoutFailureReason {
  const errNo = String(result.err_no ?? "")
    .trim()
    .padStart(3, "0");
  const message = fold(String(result.err_msg ?? ""));
  if (
    errNo === PAYTR_TOTAL_EXCEEDS_REMAINING_ERR_NO ||
    message.includes("kalan tutardan fazla")
  ) {
    return PAYOUT_FAILURE.transferTotalExceedsRemaining;
  }
  if (BANK_DETAILS_PATTERN.test(message)) {
    return PAYOUT_FAILURE.bankDetailsRejected;
  }
  return PAYOUT_FAILURE.providerRejected;
}

/** Whether the seller is e-mailed about this failure (they can fix it). */
export function isSellerActionableFailure(
  reason: string | null | undefined,
): boolean {
  return (SELLER_ACTIONABLE_PAYOUT_FAILURES as readonly string[]).includes(
    reason ?? "",
  );
}

/** Seller-facing e-mail text per seller-actionable code (Turkish copy). */
const SELLER_FAILURE_TEXT: Record<
  (typeof SELLER_ACTIONABLE_PAYOUT_FAILURES)[number],
  string
> = {
  no_bank_account: "Hesabınızda kayıtlı bir banka hesabı bulunamadı.",
  invalid_iban_format: "Kayıtlı IBAN geçerli bir TR IBAN değil.",
  bank_details_rejected:
    "IBAN veya hesap sahibi adı ödeme kuruluşu tarafından kabul edilmedi.",
};

const GENERIC_SELLER_FAILURE_TEXT = "Ödeme aktarımı tamamlanamadı.";

/**
 * Text for the seller's "payout failed" e-mail. Only the mapped codes have
 * their own text; anything else (another code, or a legacy free-text reason)
 * gets the generic line, so PayTR's wording or an oid never reaches the seller.
 */
export function sellerFailureText(reason: string | null | undefined): string {
  return isSellerActionableFailure(reason)
    ? SELLER_FAILURE_TEXT[
        reason as (typeof SELLER_ACTIONABLE_PAYOUT_FAILURES)[number]
      ]
    : GENERIC_SELLER_FAILURE_TEXT;
}
