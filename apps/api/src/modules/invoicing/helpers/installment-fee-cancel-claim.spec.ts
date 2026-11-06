import {
  formatInstallmentFeeCancelClaim,
  INSTALLMENT_FEE_CANCEL_LEASE_MS,
  isStaleInstallmentFeeCancelClaim,
  parseInstallmentFeeCancelClaim,
} from "./installment-fee-cancel-claim";

/** The cancel lease of an installment fee e-Arşiv, kept in `cancelReason`. */
describe("installment fee cancel claim", () => {
  const at = new Date("2026-11-06T10:00:00.000Z");

  it("round-trips the claim time and the holder's token", () => {
    const raw = formatInstallmentFeeCancelClaim("tok-1", at);

    expect(raw).toBe(`refund_cancelling:${at.getTime()}:tok-1`);
    expect(parseInstallmentFeeCancelClaim(raw)).toEqual({
      raw,
      claimedAt: at,
      token: "tok-1",
    });
  });

  it.each([null, undefined, "", "refund", "refunded_before_issue"])(
    "reads %p as no claim",
    (value) => {
      expect(parseInstallmentFeeCancelClaim(value)).toBeNull();
    },
  );

  it("reads the earlier bare marker as a stale claim", () => {
    const claim = parseInstallmentFeeCancelClaim("refund_cancelling");

    expect(claim?.claimedAt.getTime()).toBe(0);
    expect(claim && isStaleInstallmentFeeCancelClaim(claim, at)).toBe(true);
  });

  it("stays exclusive for the lease, then goes stale", () => {
    const claim = parseInstallmentFeeCancelClaim(
      formatInstallmentFeeCancelClaim("tok-1", at),
    );
    if (!claim) throw new Error("no claim");
    const after = (ms: number) => new Date(at.getTime() + ms);

    expect(
      isStaleInstallmentFeeCancelClaim(
        claim,
        after(INSTALLMENT_FEE_CANCEL_LEASE_MS - 1),
      ),
    ).toBe(false);
    expect(
      isStaleInstallmentFeeCancelClaim(
        claim,
        after(INSTALLMENT_FEE_CANCEL_LEASE_MS),
      ),
    ).toBe(true);
  });
});
