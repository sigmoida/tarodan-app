import { CancellationActor } from "@prisma/client";
import {
  REFUND_REQUEST_ACTOR_KEY,
  refundAttemptCancelActor,
  refundRequestCancelActor,
} from "./refund-attempt-actor";

describe("refundAttemptCancelActor", () => {
  it("attributes an unmarked refund-request attempt to the buyer who opened it", () => {
    expect(refundAttemptCancelActor("refund-request:rr-1")).toBe(
      CancellationActor.buyer,
    );
  });

  it("attributes an admin cancellation's request to the platform", () => {
    expect(
      refundAttemptCancelActor("refund-request:rr-1", {
        [REFUND_REQUEST_ACTOR_KEY]: CancellationActor.platform,
      }),
    ).toBe(CancellationActor.platform);
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

  it("never reads a platform marker for a non-request key", () => {
    expect(
      refundAttemptCancelActor("full-refund:pay-1:ord-1", {
        [REFUND_REQUEST_ACTOR_KEY]: CancellationActor.platform,
      }),
    ).toBe(CancellationActor.system);
  });
});

describe("refundRequestCancelActor", () => {
  it.each([
    [null],
    [undefined],
    [{}],
    [{ history: [] }],
    [{ [REFUND_REQUEST_ACTOR_KEY]: "buyer" }],
    // Talep yalnız alıcı ya da platform adına olabilir; başka değer alıcıya düşer.
    [{ [REFUND_REQUEST_ACTOR_KEY]: "system" }],
    ["not-an-object"],
  ])("reads %j as the buyer", (metadata) => {
    expect(refundRequestCancelActor(metadata)).toBe(CancellationActor.buyer);
  });

  it("reads the platform marker", () => {
    expect(
      refundRequestCancelActor({
        [REFUND_REQUEST_ACTOR_KEY]: "platform",
        history: [{ action: "cancellation_refunded" }],
      }),
    ).toBe(CancellationActor.platform);
  });
});
