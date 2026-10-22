// The boost setting rules, the consented-price rule and the card action live
// once in `@tarodan/types` (the API, web, admin and mobile call the same
// functions); this spec pins them for every surface.
import {
  BOOST_ENABLED_SETTING,
  BOOST_OFFER_SINCE_SETTING,
  boostOfferSince,
  boostPriceMatches,
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
    // Only the word "false" turns sales off: other "off-looking" values do not.
    ["0", true],
    ["off", true],
    ["no", true],
    ["falsey", true],
    ["false", false],
    ["FALSE", false],
    ["False", false],
    [" false ", false],
    ["\tfalse\n", false],
  ])("%p -> %p", (value, expected) => {
    expect(isBoostEnabled(value)).toBe(expected);
  });

  it("agrees with the standard toggle rule on the values the admin toggle writes", () => {
    expect(isBoostEnabled("false")).toBe(isPlatformSettingOn("false"));
    expect(isBoostEnabled("true")).toBe(isPlatformSettingOn("true"));
  });

  it.each([undefined, null, "", "0"])(
    "differs from the standard toggle rule for %p (boost stays on)",
    (value) => {
      // A missing row keeps boost on (today's production behaviour), where the
      // standard rule would read it as off.
      expect(isBoostEnabled(value)).toBe(true);
      expect(isPlatformSettingOn(value)).toBe(false);
    },
  );
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

describe("boostPriceMatches", () => {
  // The one rule that decides whether the boost purchase goes ahead at the
  // price the seller consented to: equal in whole kuruş, never a float
  // epsilon.
  it.each([
    [59.9, 59.9],
    // Float noise and a value that rounds to the same kuruş.
    [59.899999, 59.9],
    [59.900001, 59.9],
    [0.1 + 0.2, 0.3],
    [150, 150],
    [0, 0],
    [12345678.91, 12345678.91],
  ])("%p matches %p", (expected, actual) => {
    expect(boostPriceMatches(expected, actual)).toBe(true);
  });

  it.each([
    // One kuruş either way is a different price.
    [59.89, 59.9],
    [59.91, 59.9],
    [149.99, 150],
    // A campaign price is not the list price, and the other way round.
    [150, 99],
    [99, 150],
    [0, 59.9],
  ])("%p does not match %p", (expected, actual) => {
    expect(boostPriceMatches(expected, actual)).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "never matches the non-finite %p (fails closed)",
    (value) => {
      expect(boostPriceMatches(value, 59.9)).toBe(false);
      expect(boostPriceMatches(59.9, value)).toBe(false);
      expect(boostPriceMatches(value, value)).toBe(false);
    },
  );

  it("never matches a value that is not a number (a caller that skipped the DTO)", () => {
    expect(boostPriceMatches(undefined as never, 59.9)).toBe(false);
    expect(boostPriceMatches("59.9" as never, 59.9)).toBe(false);
    expect(boostPriceMatches(null as never, 0)).toBe(false);
  });
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

  it("shows nothing on the own boosted listing on mobile (no extend either)", () => {
    // CAN_BUY_DIGITAL is off on mobile: no boost and no extend button.
    expect(
      productCardAction(product({ isBoosted: true }), {
        userId: "seller-1",
        canBoost: false,
      }),
    ).toEqual({ kind: "none" });
  });

  it("shows nothing on the own boosted listing once it is not active", () => {
    expect(
      productCardAction(
        product({ isBoosted: true, status: "inactive" }),
        owner,
      ),
    ).toEqual({ kind: "none" });
  });

  it.each([0, null, undefined])(
    "offers boost on the own active listing whatever its stock (%p)",
    (availableQuantity) => {
      // Stock decides "add to cart" for buyers only; the owner never buys.
      expect(productCardAction(product({ availableQuantity }), owner)).toEqual({
        kind: "boost",
        extend: false,
      });
    },
  );

  it.each([null, undefined])(
    "reads an unknown boost state (%p) as not boosted",
    (isBoosted) => {
      expect(productCardAction(product({ isBoosted }), owner)).toEqual({
        kind: "boost",
        extend: false,
      });
    },
  );

  it("shows a guest nothing on an out-of-stock listing", () => {
    expect(
      productCardAction(product({ availableQuantity: 0 }), guest).kind,
    ).toBe("none");
  });

  it("does not show cart on another seller's boosted listing out of stock", () => {
    expect(
      productCardAction(
        product({ isBoosted: true, availableQuantity: 0 }),
        other,
      ).kind,
    ).toBe("none");
  });

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
