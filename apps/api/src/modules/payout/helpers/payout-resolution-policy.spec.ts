import { PayoutStatus } from "@prisma/client";
import { PAYOUT_FAILURE_REASONS } from "@tarodan/types";
import {
  manualSettlementMethodFor,
  manualSettlementNet,
  manualSettlementOf,
  payoutResolutionFlags,
  platformFundingAmount,
  providerMessageOf,
  transferOutcomeMayBeUnknown,
  transferTotalOf,
  withoutManualSettlement,
  type PayoutResolutionRow,
} from "./payout-resolution-policy";

const row = (over: Partial<PayoutResolutionRow> = {}): PayoutResolutionRow => ({
  status: PayoutStatus.failed,
  failureReason: "transfer_needs_manual_decision",
  providerResponse: null,
  netAmount: 40,
  submittedAmount: null,
  // The processor's failure handler counted the attempts.
  retryCount: 3,
  ...over,
});

describe("payout resolution policy", () => {
  describe("which failed rows may have reached PayTR", () => {
    it("transfer_outcome_unknown may have", () => {
      expect(
        transferOutcomeMayBeUnknown(
          row({ failureReason: "transfer_outcome_unknown" }),
        ),
      ).toBe(true);
    });

    it.each(
      PAYOUT_FAILURE_REASONS.filter((r) => r !== "transfer_outcome_unknown"),
    )("%s did not (PayTR refused, or it was never sent)", (reason) => {
      expect(transferOutcomeMayBeUnknown(row({ failureReason: reason }))).toBe(
        false,
      );
    });

    it("a legacy free-text reason from a thrown error may have (e.g. 'Bad Request Exception')", () => {
      expect(
        transferOutcomeMayBeUnknown(
          row({
            failureReason: "Bad Request Exception",
            providerResponse: null,
          }),
        ),
      ).toBe(true);
    });

    it("a legacy free-text reason without a send attempt did not (failed before sending)", () => {
      expect(
        transferOutcomeMayBeUnknown(
          row({
            failureReason: "Satıcının banka hesabı yok",
            providerResponse: null,
            retryCount: 0,
          }),
        ),
      ).toBe(false);
      expect(
        manualSettlementMethodFor(
          row({
            failureReason: "Satıcının banka hesabı yok",
            providerResponse: null,
            retryCount: 0,
          }),
        ),
      ).toBeNull();
    });

    it("a legacy free-text reason with PayTR's error answer did not (a rejection)", () => {
      expect(
        transferOutcomeMayBeUnknown(
          row({
            failureReason: "toplam transfer tutarı kalan tutardan fazla olamaz",
            providerResponse: {
              status: "error",
              err_no: "010",
              err_msg: "toplam transfer tutarı kalan tutardan fazla olamaz",
            },
          }),
        ),
      ).toBe(false);
    });

    it.each([
      PayoutStatus.returned,
      PayoutStatus.pending,
      PayoutStatus.processing,
      PayoutStatus.completed,
      PayoutStatus.retry_pending,
    ])("only failed rows count (%s does not)", (status) => {
      expect(
        transferOutcomeMayBeUnknown(
          row({ status, failureReason: "transfer_outcome_unknown" }),
        ),
      ).toBe(false);
    });

    it("the retry needs the panel check exactly for those rows", () => {
      expect(
        transferOutcomeMayBeUnknown(
          row({ failureReason: "transfer_outcome_unknown" }),
        ),
      ).toBe(true);
      expect(transferOutcomeMayBeUnknown(row())).toBe(false);
      expect(
        transferOutcomeMayBeUnknown(
          row({ status: PayoutStatus.returned, failureReason: "Geri döndü" }),
        ),
      ).toBe(false);
    });
  });

  describe("mark as paid: one method per row", () => {
    it.each([
      ["transfer_needs_manual_decision", "external_bank"],
      ["transfer_total_exceeds_remaining", "external_bank"],
      ["transfer_outcome_unknown", "paytr_confirmed"],
      ["Bad Request Exception", "paytr_confirmed"],
      ["provider_rejected", null],
      ["provider_unreachable", null],
      ["bank_details_rejected", null],
      ["no_bank_account", null],
      ["invalid_iban_format", null],
      ["order_not_payout_eligible", null],
      ["refund_pending", null],
      ["order_refunded", null],
      ["fully_refunded", null],
    ])("failed / %s -> %s", (reason, method) => {
      expect(manualSettlementMethodFor(row({ failureReason: reason }))).toBe(
        method,
      );
    });

    it("never offers a method for a row that is not failed", () => {
      for (const status of Object.values(PayoutStatus)) {
        if (status === PayoutStatus.failed) continue;
        expect(
          manualSettlementMethodFor(
            row({ status, failureReason: "transfer_needs_manual_decision" }),
          ),
        ).toBeNull();
      }
    });

    it("refuses external_bank when the total had nothing to cap against (data problem, not a residual)", () => {
      expect(
        manualSettlementMethodFor(
          row({
            providerResponse: {
              transferTotal: {
                net: 40,
                allowedTotal: 0,
                missingInput: "payment",
              },
            },
          }),
        ),
      ).toBeNull();
    });

    it("the PayTR-confirmed net is what the unknown request carried; legacy rows fall back to the row net", () => {
      expect(
        manualSettlementNet(
          row({
            failureReason: "transfer_outcome_unknown",
            netAmount: 90,
            submittedAmount: 88.5,
          }),
          "paytr_confirmed",
        ),
      ).toBe(88.5);
      expect(
        manualSettlementNet(
          row({ failureReason: "Bad Request Exception", netAmount: 90 }),
          "paytr_confirmed",
        ),
      ).toBe(90);
      expect(
        manualSettlementNet(
          row({ netAmount: "40.10", submittedAmount: 12 }),
          "external_bank",
        ),
      ).toBe(40.1);
    });

    it("the list flags carry the method and the net to confirm", () => {
      expect(payoutResolutionFlags(row())).toEqual({
        retryRequiresProviderCheck: false,
        markPaidMethod: "external_bank",
        markPaidNetAmount: 40,
      });
      expect(
        payoutResolutionFlags(
          row({
            failureReason: "transfer_outcome_unknown",
            submittedAmount: 300,
            netAmount: 300,
          }),
        ),
      ).toEqual({
        retryRequiresProviderCheck: true,
        markPaidMethod: "paytr_confirmed",
        markPaidNetAmount: 300,
      });
      expect(
        payoutResolutionFlags(row({ status: PayoutStatus.completed })),
      ).toEqual({
        retryRequiresProviderCheck: false,
        markPaidMethod: null,
        markPaidNetAmount: null,
      });
    });
  });

  describe("platform funding for an external_bank payout", () => {
    it.each([
      // [net, escrow in the ledger, funded]
      [40, 0, 40], // residual after a full refund: escrow already closed
      [40, 15.5, 24.5], // escrow holds part of it
      [40, 40, 0], // escrow covers it
      [40, 55, 0], // escrow holds more (never negative funding)
      [40, -3, 40], // over-closed escrow counts as 0
      [0.1 + 0.2, 0.1, 0.2], // kuruş math, no float drift
    ])("net %p, escrow %p -> %p", (net, escrow, funded) => {
      expect(platformFundingAmount(net, escrow)).toBe(funded);
    });
  });

  it("reads the transfer total snapshot a parked row carries", () => {
    expect(transferTotalOf(null)).toBeNull();
    expect(transferTotalOf({ status: "error" })).toBeNull();
    expect(
      transferTotalOf({
        transferTotal: {
          net: 40,
          allowedTotal: 0,
          ownAllowed: 0,
          oidRemaining: 0,
          sourceTotal: 322,
          missingInput: "source",
        },
      }),
    ).toEqual({
      net: 40,
      allowedTotal: 0,
      ownAllowed: 0,
      oidRemaining: 0,
      missingInput: "source",
    });
  });

  it("reads PayTR's rejection message, and nothing else, for the admin list", () => {
    expect(
      providerMessageOf({
        status: "error",
        err_no: "005",
        err_msg: "  IBAN hatali  ",
        transferTotal: { net: 40 },
      }),
    ).toBe("IBAN hatali");
    expect(providerMessageOf(null)).toBeNull();
    expect(providerMessageOf({ status: "success" })).toBeNull();
    expect(providerMessageOf({ status: "error", err_msg: " " })).toBeNull();
    // A network failure is our message, not PayTR's.
    expect(
      providerMessageOf({
        error: { phase: "unknown", causeCode: "ECONNRESET", message: "x" },
      }),
    ).toBeNull();
  });

  it("drops an earlier manual settlement from a row sent again, keeping the rest", () => {
    const response = {
      status: "success",
      returned: { ref_no: "R1" },
      manualSettlement: { method: "paytr_confirmed", reference: "P1" },
    };
    expect(withoutManualSettlement(response)).toEqual({
      status: "success",
      returned: { ref_no: "R1" },
    });
    expect(withoutManualSettlement(null)).toBeNull();
    const plain = { status: "success" };
    expect(withoutManualSettlement(plain)).toBe(plain);
  });

  it("reads back the manual settlement stored on a row", () => {
    expect(manualSettlementOf(null)).toBeNull();
    expect(
      manualSettlementOf({ manualSettlement: { method: "other" } }),
    ).toBeNull();
    expect(
      manualSettlementOf({
        transferTotal: {},
        manualSettlement: {
          method: "external_bank",
          reference: "EFT-1",
          adminId: "admin-1",
          settledAt: "2026-10-23T10:00:00.000Z",
          netAmount: 40,
          platformFundedAmount: 40,
        },
      }),
    ).toEqual({
      method: "external_bank",
      reference: "EFT-1",
      adminId: "admin-1",
      settledAt: "2026-10-23T10:00:00.000Z",
      netAmount: 40,
      platformFundedAmount: 40,
    });
  });
});
