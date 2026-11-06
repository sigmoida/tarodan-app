import { Prisma } from "@prisma/client";
import type { InstallmentBuyerSegment } from "@tarodan/types";
import { effectiveMembershipTierType } from "../../membership/helpers/membership.util";

/**
 * The buyer's installment segment (ADR 0019, plan 4.6.1). One function for
 * the options call and the signing call.
 *
 * - A guest purchase (`CheckoutGroup.isGuest`, the order's guest address
 *   flag) or no signed-in user is `guest`. A guest order's buyer row is the
 *   shared system account: its tier is never read.
 * - Otherwise the effective membership tier from the entitlement rule
 *   (`effectiveMembershipTierType`: active, or cancelled inside the paid
 *   period; `business` also needs an approved corporate identity), the same
 *   pure util the commission guard uses. Importing `MembershipModule` would
 *   create a module cycle (it imports `PaymentModule`). The discount
 *   module's `resolveUserTier` is NOT used: it ignores the period end and
 *   the corporate check.
 */

/** What `installmentSegmentOf` reads of the buyer. */
export const INSTALLMENT_BUYER_SELECT = {
  businessStatus: true,
  companyName: true,
  taxId: true,
  membership: {
    select: {
      status: true,
      currentPeriodEnd: true,
      tier: { select: { type: true, isActive: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type InstallmentSegmentBuyer = Prisma.UserGetPayload<{
  select: typeof INSTALLMENT_BUYER_SELECT;
}>;

export function installmentSegmentOf(input: {
  /** A guest purchase: the segment is `guest`, whatever the buyer row. */
  guest: boolean;
  /** The signed-in buyer; null = nobody signed in. */
  buyer: InstallmentSegmentBuyer | null;
}): InstallmentBuyerSegment {
  if (input.guest || !input.buyer) return "guest";
  return effectiveMembershipTierType(input.buyer.membership, input.buyer);
}
