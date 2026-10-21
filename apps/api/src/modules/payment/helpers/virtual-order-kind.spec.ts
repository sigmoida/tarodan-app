import { isVirtualOrderKind } from "@tarodan/types";
import { boostVirtualProductId, virtualOrderKind } from "./virtual-order-kind";

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
});
