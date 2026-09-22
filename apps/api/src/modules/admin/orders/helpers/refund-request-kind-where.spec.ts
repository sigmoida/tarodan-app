import { refundRequestKindOf } from "@tarodan/types";
import { refundRequestKindWhere } from "./refund-request-kind-where";

describe("refund request kind", () => {
  it("reads a pre-shipment cancellation from its *_cancellation policy", () => {
    for (const code of [
      "buyer_remorse_cancellation",
      "seller_fault_cancellation",
      "manual_review_cancellation",
    ]) {
      expect(refundRequestKindOf(code)).toBe("cancellation");
    }
  });

  it("treats every other policy (and none) as a product return", () => {
    for (const code of ["v2_buyer_return", "seller_fault_return", "legacy"]) {
      expect(refundRequestKindOf(code)).toBe("return");
    }
    expect(refundRequestKindOf(null)).toBe("return");
  });

  it("filters the list with the same suffix rule", () => {
    expect(refundRequestKindWhere("cancellation")).toEqual({
      policyCode: { endsWith: "_cancellation" },
    });
    expect(refundRequestKindWhere("return")).toEqual({
      NOT: { policyCode: { endsWith: "_cancellation" } },
    });
  });
});
