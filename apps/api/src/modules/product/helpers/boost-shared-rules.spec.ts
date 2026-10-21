// The boost setting rules and the card action live once in `@tarodan/types`
// (the API, web, admin and mobile call the same functions); this spec pins them
// for every surface.
import {
  BOOST_ENABLED_SETTING,
  BOOST_OFFER_SINCE_SETTING,
  boostOfferSince,
  isBoostEnabled,
  isPlatformSettingOn,
  productCardAction,
  type ProductCardActionProduct,
} from "@tarodan/types";

describe("isBoostEnabled", () => {
  it("names the setting it reads", () => {
    expect(BOOST_ENABLED_SETTING).toBe("boost_enabled");
  });

  it.each([
    [undefined, true],
    [null, true],
    ["", true],
    ["   ", true],
    ["true", true],
    ["TRUE", true],
    ["anything", true],
    ["false", false],
    ["FALSE", false],
    [" false ", false],
  ])("%p -> %p", (value, expected) => {
    expect(isBoostEnabled(value)).toBe(expected);
  });

  it("differs from the standard toggle rule only for a missing value", () => {
    // A missing row keeps boost on (today's production behaviour), where the
    // standard rule would read it as off.
    expect(isBoostEnabled(undefined)).toBe(true);
    expect(isPlatformSettingOn(undefined)).toBe(false);
    expect(isBoostEnabled("false")).toBe(isPlatformSettingOn("false"));
    expect(isBoostEnabled("true")).toBe(isPlatformSettingOn("true"));
  });
});

describe("boostOfferSince", () => {
  it("names the setting it reads", () => {
    expect(BOOST_OFFER_SINCE_SETTING).toBe("boost_offer_since");
  });

  it("reads a valid ISO timestamp", () => {
    expect(boostOfferSince("2026-11-01T00:00:00.000Z")?.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });

  it.each([undefined, null, "", "  ", "not a date"])(
    "%p turns offers off",
    (value) => {
      expect(boostOfferSince(value)).toBeNull();
    },
  );
});

describe("productCardAction", () => {
  const product = (
    over: Partial<ProductCardActionProduct> = {},
  ): ProductCardActionProduct => ({
    sellerId: "seller-1",
    status: "active",
    availableQuantity: 1,
    isBoosted: false,
    ...over,
  });
  const owner = { userId: "seller-1", canBoost: true };
  const other = { userId: "buyer-1", canBoost: true };
  const guest = { userId: null, canBoost: false };

  it("offers boost on the viewer's own active listing", () => {
    expect(productCardAction(product(), owner)).toEqual({
      kind: "boost",
      extend: false,
    });
  });

  it("offers extend on the viewer's own boosted listing", () => {
    expect(productCardAction(product({ isBoosted: true }), owner)).toEqual({
      kind: "boost",
      extend: true,
    });
  });

  it("shows nothing on the own listing while boost cannot be bought", () => {
    // Web with boost sales off, and mobile (CAN_BUY_DIGITAL is off).
    expect(
      productCardAction(product(), { userId: "seller-1", canBoost: false }),
    ).toEqual({ kind: "none" });
  });

  it("never offers add to cart on the viewer's own listing", () => {
    expect(
      productCardAction(product({ availableQuantity: 5 }), {
        userId: "seller-1",
        canBoost: false,
      }).kind,
    ).toBe("none");
  });

  it.each(["inactive", "sold", "pending", "suspended", null])(
    "shows nothing on the own %p listing",
    (status) => {
      expect(productCardAction(product({ status }), owner)).toEqual({
        kind: "none",
      });
    },
  );

  it("offers add to cart on another seller's active listing in stock", () => {
    expect(productCardAction(product(), other)).toEqual({
      kind: "add_to_cart",
    });
  });

  it("offers add to cart to a guest", () => {
    expect(productCardAction(product(), guest)).toEqual({
      kind: "add_to_cart",
    });
  });

  it("treats a missing quantity as unlimited stock", () => {
    // The API omits availableQuantity for a listing without a quantity.
    expect(
      productCardAction(product({ availableQuantity: undefined }), other).kind,
    ).toBe("add_to_cart");
    expect(
      productCardAction(product({ availableQuantity: null }), other).kind,
    ).toBe("add_to_cart");
  });

  it("shows nothing on an out-of-stock listing", () => {
    expect(
      productCardAction(product({ availableQuantity: 0 }), other).kind,
    ).toBe("none");
  });

  it.each(["inactive", "sold", "pending", "rejected", null])(
    "shows nothing on another seller's %p listing",
    (status) => {
      expect(productCardAction(product({ status }), other).kind).toBe("none");
    },
  );

  it("does not treat a listing without a seller as the guest's own", () => {
    expect(productCardAction(product({ sellerId: null }), guest).kind).toBe(
      "add_to_cart",
    );
  });

  it("ignores canBoost for other people's listings", () => {
    expect(
      productCardAction(product({ isBoosted: true }), {
        userId: "buyer-1",
        canBoost: false,
      }).kind,
    ).toBe("add_to_cart");
  });
});
