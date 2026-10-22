import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  assertProposalWithinPriceCeiling,
  isOfferAcceptableAtPrice,
  isWithinPriceCeiling,
  offerPriceChangedError,
  offerProposer,
} from "./offer-price-ceiling-policy";

/**
 * The ceiling of an offer amount against the current sale price: the buyer
 * (offer, buyer counter) strictly below it, the seller counter up to it. The
 * service paths are pinned in `../offer-price-ceiling.spec.ts`.
 */

const i18nKeyOf = (error: unknown) =>
  (error as { response?: { i18nKey?: string } } | undefined)?.response?.i18nKey;

describe("offer price ceiling helpers", () => {
  it("names the proposer from buyerMustAccept", () => {
    expect(offerProposer({ buyerMustAccept: true })).toBe("seller");
    expect(offerProposer({ buyerMustAccept: false })).toBe("buyer");
    expect(offerProposer({ buyerMustAccept: null })).toBe("buyer");
  });

  it.each([
    ["buyer", 999.99, true],
    ["buyer", 1000, false],
    ["buyer", 1000.01, false],
    ["seller", 999.99, true],
    ["seller", 1000, true],
    ["seller", 1000.01, false],
  ] as const)(
    "%s amount %p on a 1000 TL price is within the ceiling: %p",
    (proposer, amount, within) => {
      expect(isWithinPriceCeiling(amount, 1000, proposer)).toBe(within);
    },
  );

  it("refuses a buyer amount at the price with offerMustBeBelowPrice", () => {
    const error = (() => {
      try {
        assertProposalWithinPriceCeiling(1000, 1000, "buyer");
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(BadRequestException);
    expect(i18nKeyOf(error)).toBe("server.offer.offerMustBeBelowPrice");
  });

  it("refuses a seller amount above the price with counterCannotExceedPrice", () => {
    const error = (() => {
      try {
        assertProposalWithinPriceCeiling(1000.01, 1000, "seller");
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(BadRequestException);
    expect(i18nKeyOf(error)).toBe("server.offer.counterCannotExceedPrice");
  });

  it("reads a Decimal-like amount for the accept check", () => {
    const decimal = new Prisma.Decimal("1000");
    expect(
      isOfferAcceptableAtPrice(
        { amount: decimal, buyerMustAccept: false },
        1000,
      ),
    ).toBe(false);
    expect(
      isOfferAcceptableAtPrice(
        { amount: decimal, buyerMustAccept: true },
        1000,
      ),
    ).toBe(true);
  });

  it("the accept refusal is a 409 carrying the current price", () => {
    const error = offerPriceChangedError(899.5);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      i18nKey: "server.offer.priceChangedSinceOffer",
      i18nParams: { price: "899.50" },
    });
  });
});
