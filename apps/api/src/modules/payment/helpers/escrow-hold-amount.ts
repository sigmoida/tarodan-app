/**
 * The seller's escrow hold of a paid order: the ONE formula for what the
 * seller is transferred (`submerchant_amount`) before refunds. The escrow hold
 * at capture and the installment keep guard (which must know the transfer
 * before the charge) both read it here.
 *
 *   hold = total - commission - stopaj - buyer service VAT
 *          - seller service VAT - FULL shipping + platform-funded discount
 *
 * - Stopaj (GVK 94/19) is withheld from the hold and never paid out.
 * - Service VAT leaves the seller from both sides: the buyer's is collected
 *   inside `totalAmount` but is Tarodan's VAT, the seller's is deducted.
 * - The carrier invoices the platform, so the FULL shipping (buyer and seller
 *   share) stays with the platform.
 * - A platform-funded campaign share is added back: the seller is paid on the
 *   price before the discount.
 * - A negative result is held as 0 and the gap is the `shippingDeficit` (a
 *   seller debt). Columns not written on legacy orders count as 0.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The order fields the hold reads (Decimal, number or legacy null). */
export interface EscrowHoldOrderFields {
  totalAmount: unknown;
  commissionAmount: unknown;
  withholdingTaxAmount?: unknown;
  buyerServiceTaxAmount?: unknown;
  sellerServiceTaxAmount?: unknown;
  buyerShippingAmount?: unknown;
  sellerShippingAmount?: unknown;
  shippingCost?: unknown;
  platformFundedDiscount?: unknown;
}

/**
 * The FULL shipping of an order (buyer share + seller share). Legacy and
 * indirect paths that never wrote the share columns count the legacy
 * `shippingCost` (charged to the buyer) as the full amount; an order without
 * shipping (membership, digital) is 0.
 */
export function fullShippingAmountOf(order: {
  buyerShippingAmount?: unknown;
  sellerShippingAmount?: unknown;
  shippingCost?: unknown;
}): number {
  const buyer = Number(order.buyerShippingAmount ?? 0);
  const seller = Number(order.sellerShippingAmount ?? 0);
  if (buyer > 0 || seller > 0) return buyer + seller;
  return Number(order.shippingCost ?? 0);
}

export interface EscrowHoldAmount {
  /** What the hold keeps for the seller, >= 0, TL. */
  sellerAmount: number;
  /** The part the hold could not cover, booked as a seller debt, >= 0. */
  shippingDeficit: number;
}

export function escrowHoldAmountOf(
  order: EscrowHoldOrderFields,
): EscrowHoldAmount {
  const raw = round2(
    Number(order.totalAmount) -
      Number(order.commissionAmount) -
      Number(order.withholdingTaxAmount ?? 0) -
      Number(order.buyerServiceTaxAmount ?? 0) -
      Number(order.sellerServiceTaxAmount ?? 0) -
      fullShippingAmountOf(order) +
      Number(order.platformFundedDiscount ?? 0),
  );
  return {
    sellerAmount: Math.max(0, raw),
    shippingDeficit: round2(Math.max(0, -raw)),
  };
}
