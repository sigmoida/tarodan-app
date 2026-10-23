import {
  ORDER_KINDS,
  isDigitalOrder,
  isVirtualOrderKind,
} from "@tarodan/types";
import {
  boostVirtualProductId,
  membershipTierIdOf,
  orderKindOf,
  virtualOrderKind,
} from "./virtual-order-kind";

describe("virtualOrderKind", () => {
  it("reads membership and boost orders from the virtual product id", () => {
    expect(virtualOrderKind({ productId: "membership-tier-1" })).toBe(
      "membership",
    );
    expect(virtualOrderKind({ productId: "boost-b1" })).toBe("boost");
    expect(virtualOrderKind({ productId: boostVirtualProductId("b1") })).toBe(
      "boost",
    );
  });

  it("is null for a listing order and for a missing order or product", () => {
    expect(virtualOrderKind({ productId: "3f1c2a7e-listing" })).toBeNull();
    // A prefix inside the id is not a virtual product.
    expect(virtualOrderKind({ productId: "x-boost-1" })).toBeNull();
    expect(virtualOrderKind({ productId: null })).toBeNull();
    expect(virtualOrderKind({})).toBeNull();
    expect(virtualOrderKind(null)).toBeNull();
    expect(virtualOrderKind(undefined)).toBeNull();
  });

  it("builds the boost virtual product id", () => {
    expect(boostVirtualProductId("b1")).toBe("boost-b1");
  });

  it("isVirtualOrderKind accepts only the kinds (the return URL `type`)", () => {
    expect(isVirtualOrderKind("membership")).toBe(true);
    expect(isVirtualOrderKind("boost")).toBe(true);
    expect(isVirtualOrderKind("order")).toBe(false);
    expect(isVirtualOrderKind(undefined)).toBe(false);
  });

  it("reads the tier a membership order was bought for", () => {
    expect(membershipTierIdOf({ productId: "membership-tier-1" })).toBe(
      "tier-1",
    );
    expect(membershipTierIdOf({ productId: "boost-b1" })).toBeNull();
    expect(membershipTierIdOf({ productId: "listing-1" })).toBeNull();
    expect(membershipTierIdOf(null)).toBeNull();
  });
});

describe("orderKindOf (the order response `kind`)", () => {
  it("is the platform service of a virtual order and `listing` otherwise", () => {
    expect(orderKindOf({ productId: "membership-tier-1" })).toBe("membership");
    expect(orderKindOf({ productId: boostVirtualProductId("b1") })).toBe(
      "boost",
    );
    expect(orderKindOf({ productId: "3f1c2a7e-listing" })).toBe("listing");
    expect(orderKindOf({ productId: null })).toBe("listing");
    expect(orderKindOf(null)).toBe("listing");
  });

  it("only ever returns a shared order kind", () => {
    expect(ORDER_KINDS).toEqual(["listing", "membership", "boost"]);
    for (const productId of ["membership-t", "boost-b", "p-1", null]) {
      expect(ORDER_KINDS).toContain(orderKindOf({ productId }));
    }
  });
});

describe("isDigitalOrder (the client gating rule, @tarodan/types)", () => {
  it("reads `kind` when the API sends it", () => {
    expect(isDigitalOrder({ kind: "membership" })).toBe(true);
    expect(isDigitalOrder({ kind: "boost" })).toBe(true);
    expect(isDigitalOrder({ kind: "listing" })).toBe(false);
  });

  it("treats a kind it does not know yet as a platform service", () => {
    expect(isDigitalOrder({ kind: "gift_card" })).toBe(true);
  });

  it("lets `kind` win over the fallbacks", () => {
    expect(
      isDigitalOrder({
        kind: "listing",
        origin: "platform_service",
        isMembership: true,
      }),
    ).toBe(false);
    expect(
      isDigitalOrder({
        kind: "boost",
        origin: "direct_sale",
        isMembership: false,
      }),
    ).toBe(true);
  });

  it("falls back to `origin` when `kind` is absent (an older API)", () => {
    expect(isDigitalOrder({ origin: "platform_service" })).toBe(true);
    expect(isDigitalOrder({ kind: null, origin: "platform_service" })).toBe(
      true,
    );
    expect(isDigitalOrder({ origin: "direct_sale" })).toBe(false);
    expect(isDigitalOrder({ origin: "offer" })).toBe(false);
  });

  it("falls back to `isMembership` when `kind` and `origin` are absent", () => {
    expect(isDigitalOrder({ isMembership: true })).toBe(true);
    expect(isDigitalOrder({ isMembership: false })).toBe(false);
  });

  it("is false when nothing tells the order apart", () => {
    expect(isDigitalOrder({})).toBe(false);
    expect(isDigitalOrder(null)).toBe(false);
    expect(isDigitalOrder(undefined)).toBe(false);
  });
});
