import {
  REFUND_REQUEST_KEY_PREFIX,
  refundRequestAttemptKey,
  refundRequestIdOf,
} from "./refund-request-key";

describe("refund-request attempt key", () => {
  it("builds the attempt key the refund paths write (`refund-request:<id>`)", () => {
    expect(refundRequestAttemptKey("rr-1")).toBe("refund-request:rr-1");
    expect(
      refundRequestAttemptKey("rr-1").startsWith(REFUND_REQUEST_KEY_PREFIX),
    ).toBe(true);
  });

  it("round-trips through refundRequestIdOf", () => {
    expect(refundRequestIdOf(refundRequestAttemptKey("rr-9"))).toBe("rr-9");
  });

  it("does not read a request id out of a foreign key", () => {
    expect(refundRequestIdOf("hold-residual:h1")).toBeUndefined();
    expect(refundRequestIdOf(null)).toBeUndefined();
  });
});
