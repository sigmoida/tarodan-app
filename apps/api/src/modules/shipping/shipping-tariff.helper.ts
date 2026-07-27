import { Prisma } from "@prisma/client";

/**
 * Pure shipping-tariff math — the SINGLE source both the checkout pricing path and
 * the admin preview use, so a displayed quote can never diverge from what is charged.
 * All money is Decimal; the caller rounds once at the package level.
 */

const D = Prisma.Decimal;
type DecimalLike = Prisma.Decimal | number | string;

export interface OutboundTariffLike {
  outboundPackageFee: DecimalLike;
  freeShippingEnabled: boolean;
  freeShippingThreshold: DecimalLike;
}

/**
 * Full outbound shipping for ONE seller package at a given package subtotal.
 * Free when free-shipping is enabled and the subtotal reaches the threshold,
 * otherwise the flat per-package fee. Returns the "full" amount BEFORE the
 * buyer/seller split (that split lives in the commission rule's shippingBuyerShare).
 */
export function outboundPackageShipping(
  tariff: OutboundTariffLike,
  subtotal: DecimalLike,
): Prisma.Decimal {
  const sub = new D(subtotal);
  if (
    tariff.freeShippingEnabled &&
    sub.gte(new D(tariff.freeShippingThreshold))
  ) {
    return new D(0);
  }
  return new D(tariff.outboundPackageFee);
}

/**
 * Split a full package shipping amount into buyer/seller shares by a buyer-share
 * percentage (0..100, from the commission rule). Rounds each leg to 2dp once.
 */
export function splitBuyerSeller(
  fullShipping: DecimalLike,
  buyerSharePct: DecimalLike,
): { buyer: Prisma.Decimal; seller: Prisma.Decimal } {
  const full = new D(fullShipping);
  const pct = D.max(new D(0), D.min(new D(100), new D(buyerSharePct)));
  const buyer = full.mul(pct).div(100).toDecimalPlaces(2);
  const seller = full.sub(buyer).toDecimalPlaces(2);
  return { buyer, seller };
}
