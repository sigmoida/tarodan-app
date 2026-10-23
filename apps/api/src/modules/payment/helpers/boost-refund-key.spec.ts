import {
  boostRefundIdempotencyKey,
  boostRefundKeyPrefix,
  isBoostRefundKey,
} from "./boost-refund-key";

describe("boost refund key", () => {
  it("numbers the attempts of one boost under one prefix", () => {
    expect(boostRefundKeyPrefix("b-1")).toBe("boost-refund:b-1:");
    expect(boostRefundIdempotencyKey("b-1", 0)).toBe("boost-refund:b-1:0");
    expect(boostRefundIdempotencyKey("b-1", 2)).toBe("boost-refund:b-1:2");
    expect(boostRefundIdempotencyKey("b-1", 0)).toBe(
      boostRefundIdempotencyKey("b-1", 0),
    );
  });

  it("never lets one boost's prefix match another boost's keys", () => {
    expect(
      boostRefundIdempotencyKey("b-12", 0).startsWith(
        boostRefundKeyPrefix("b-1"),
      ),
    ).toBe(false);
  });

  it.each([
    ["boost-refund:b-1:0", true],
    ["full-refund:pay-1:ord-1", false],
    ["refund-request:rr-1", false],
    [null, false],
    [undefined, false],
  ])("recognises %p: %p", (key, expected) => {
    expect(isBoostRefundKey(key)).toBe(expected);
  });
});
