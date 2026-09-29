import {
  compareOfferToListing,
  readOfferListingUnitPrice,
} from "./order-offer-snapshot";

describe("readOfferListingUnitPrice", () => {
  it("reads the listing price frozen at acceptance", () => {
    expect(
      readOfferListingUnitPrice({
        version: 2,
        offer: { listingUnitPrice: 1250, amount: 1000 },
      }),
    ).toBe(1250);
  });

  it.each([
    ["no snapshot", null],
    ["a pre-snapshot order", { version: 2, pricing: {} }],
    ["a malformed value", { offer: { listingUnitPrice: "1250" } }],
  ])("is null for %s", (_label, snapshot) => {
    expect(readOfferListingUnitPrice(snapshot)).toBeNull();
  });
});

describe("compareOfferToListing", () => {
  it("prefers the snapshot and signs the difference listing − offer", () => {
    expect(
      compareOfferToListing({
        financialSnapshot: { offer: { listingUnitPrice: 1250.1 } },
        currentListingPrice: 999,
        offerAmount: 1000.2,
      }),
    ).toEqual({ listingPrice: 1250.1, approximate: false, difference: 249.9 });
  });

  it("falls back to today's listing price and says so", () => {
    expect(
      compareOfferToListing({
        financialSnapshot: null,
        currentListingPrice: 900,
        offerAmount: 1000,
      }),
    ).toEqual({ listingPrice: 900, approximate: true, difference: -100 });
  });

  it("has no difference when no price is known", () => {
    expect(
      compareOfferToListing({
        financialSnapshot: null,
        currentListingPrice: null,
        offerAmount: 1000,
      }),
    ).toEqual({ listingPrice: null, approximate: false, difference: null });
  });
});
