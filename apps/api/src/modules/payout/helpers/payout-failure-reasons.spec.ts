import { PAYOUT_FAILURE_REASONS } from "@tarodan/types";
import {
  PAYOUT_FAILURE,
  classifyTransferRejection,
  isSellerActionableFailure,
  sellerFailureText,
} from "./payout-failure-reasons";

/**
 * Sentry TARODAN-API-31..36: PayTR's rejection text (including the group
 * oid) went to the seller as the payout failure reason, and every rejection
 * was retried with the same trans_id. The reason is now a code: PayTR's
 * err_no 010 is the only rejection worth retrying, a bank-details rejection
 * is the only one the seller can fix, everything else is the team's.
 */
describe("classifyTransferRejection", () => {
  it.each([
    [{ err_no: "010", err_msg: "anything" }],
    [{ err_no: "10" }],
    [{ err_no: 10 }],
    [{ err_msg: "toplam transfer tutarı kalan tutardan fazla olamaz" }],
    [{ err_msg: "Toplam transfer tutari kalan tutardan fazla olamaz" }],
  ])("maps PayTR err_no 010 to a retryable total rejection: %j", (result) => {
    expect(classifyTransferRejection(result)).toBe(
      PAYOUT_FAILURE.transferTotalExceedsRemaining,
    );
  });

  it.each([
    "Geçersiz IBAN",
    "İBAN numarası hatalı",
    "transfer_iban gecersiz",
    "transfer_name ile hesap sahibi uyusmuyor",
    "Alıcı adı / ünvan hatalı",
    "Hesap sahibi bilgisi eşleşmedi",
  ])("maps a bank-details rejection to bank_details_rejected: %s", (msg) => {
    expect(classifyTransferRejection({ err_no: "005", err_msg: msg })).toBe(
      PAYOUT_FAILURE.bankDetailsRejected,
    );
  });

  it.each([
    [{ err_no: "003", err_msg: "Sistem hatası" }],
    [{ err_msg: "" }],
    [{}],
    // Names an IBAN but says nothing is wrong with the seller's details:
    // e-mailing the seller would send them to change a correct IBAN.
    [{ err_msg: "IBAN'a transfer şu an yapılamıyor" }],
    [{ err_msg: "Platform IBAN tanımlı değil" }],
    [{ err_msg: "Bu kısım için transfer yapılamaz" }],
  ])("maps any other rejection to provider_rejected: %j", (result) => {
    expect(classifyTransferRejection(result)).toBe(
      PAYOUT_FAILURE.providerRejected,
    );
  });
});

describe("seller-facing failure reasons", () => {
  it("only the seller-fixable reasons are seller-actionable", () => {
    expect(
      PAYOUT_FAILURE_REASONS.filter((reason) =>
        isSellerActionableFailure(reason),
      ).sort(),
    ).toEqual(
      [
        "bank_details_rejected",
        "invalid_iban_format",
        "no_bank_account",
      ].sort(),
    );
    expect(isSellerActionableFailure("toplam transfer tutarı ...")).toBe(false);
    expect(isSellerActionableFailure(null)).toBe(false);
  });

  it("maps every seller-actionable code to its own text", () => {
    const texts = [
      PAYOUT_FAILURE.noBankAccount,
      PAYOUT_FAILURE.invalidIbanFormat,
      PAYOUT_FAILURE.bankDetailsRejected,
    ].map(sellerFailureText);
    expect(new Set(texts).size).toBe(3);
    expect(texts.every((text) => text.length > 0)).toBe(true);
  });

  it("never echoes the stored reason: raw PayTR text or an oid becomes the generic text", () => {
    const raw =
      "toplam transfer tutarı kalan tutardan fazla olamaz GRPTEST000001T000001";
    const text = sellerFailureText(raw);
    expect(text).toBe(sellerFailureText(undefined));
    expect(text).not.toContain("GRP");
    expect(text).not.toContain("kalan tutar");
  });
});
