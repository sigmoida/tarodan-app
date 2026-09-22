import { CancellationActor } from "@prisma/client";
import { refundAttemptCancelActor } from "./refund-attempt-actor";

describe("refundAttemptCancelActor", () => {
  it("attributes a refund-request attempt to the buyer who opened it", () => {
    expect(refundAttemptCancelActor("refund-request:rr-1")).toBe(
      CancellationActor.buyer,
    );
  });

  it.each([
    ["full-refund:pay-1:ord-1"],
    ["stock-shortage-refund:pay-1:ord-1"],
    ["admin-manual-7f3c"],
    [null],
    [undefined],
  ])("falls back to system for %s", (key) => {
    expect(refundAttemptCancelActor(key)).toBe(CancellationActor.system);
  });
});
