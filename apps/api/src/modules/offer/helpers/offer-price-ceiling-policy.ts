import { BadRequestException, ConflictException } from "@nestjs/common";
import { i18nMessage } from "../../i18n";

/**
 * Who proposed the amount of an offer row: a seller counter
 * (`buyerMustAccept`) is the seller's, the first offer and a buyer counter
 * are the buyer's.
 */
export type OfferProposer = "buyer" | "seller";

export function offerProposer(offer: {
  buyerMustAccept: boolean | null;
}): OfferProposer {
  return offer.buyerMustAccept ? "seller" : "buyer";
}

/**
 * The upper bound of an offer amount: the listing's CURRENT sale price
 * (`resolveSalePrice`, the number web and mobile show as `price`), read when
 * the amount is proposed and again when it is accepted.
 *
 * - The buyer stays strictly below the price: at the price it is a purchase,
 *   not an offer (web `offerSchema`, mobile `MakeOfferModal`).
 * - The seller counter may reach the price (mobile `sellerCounterSchema`,
 *   `server.offer.counterCannotExceedPrice`).
 *
 * The lower bounds (the platform floor and the minimum percentage) are
 * separate rules (`offer-price-floor.ts`, `minOfferPercentage`).
 */
export function isWithinPriceCeiling(
  amount: number,
  salePrice: number,
  proposer: OfferProposer,
): boolean {
  return proposer === "seller" ? amount <= salePrice : amount < salePrice;
}

/** Refuses a new offer or counter above its proposer's ceiling with a 400. */
export function assertProposalWithinPriceCeiling(
  amount: number,
  salePrice: number,
  proposer: OfferProposer,
): void {
  if (isWithinPriceCeiling(amount, salePrice, proposer)) return;
  throw new BadRequestException(
    i18nMessage(
      proposer === "seller"
        ? "server.offer.counterCannotExceedPrice"
        : "server.offer.offerMustBeBelowPrice",
    ),
  );
}

/**
 * Whether a pending offer can still be accepted: its amount must fit its
 * proposer's ceiling against the price read when it is accepted. Nothing is
 * agreed before the accept, so the accept checks the same bound the proposal
 * did; after a price drop an offer at or above the new price (a seller counter
 * above it) would charge more than buying outright.
 */
export function isOfferAcceptableAtPrice(
  offer: { amount: unknown; buyerMustAccept: boolean | null },
  salePrice: number,
): boolean {
  return isWithinPriceCeiling(
    Number(offer.amount),
    salePrice,
    offerProposer(offer),
  );
}

/**
 * The refusal of such an accept: a 409, because the offer was valid when it
 * was made and the listing changed since. Carries the current price.
 */
export function offerPriceChangedError(salePrice: number): ConflictException {
  return new ConflictException(
    i18nMessage("server.offer.priceChangedSinceOffer", {
      price: salePrice.toFixed(2),
    }),
  );
}
