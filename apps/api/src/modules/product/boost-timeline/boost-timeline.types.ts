import type { BoostStatus, Prisma } from "@prisma/client";

/** Result of an activation: the boosted listing and its boost's end. */
export interface BoostActivation {
  productId: string;
  endsAt: Date;
}

/** A free staff grant (`source = admin_grant`): no order, payment or invoice. */
export interface BoostGrantInput {
  productId: string;
  /** Package snapshot; no package means search priority only. */
  packageId: string | null;
  packageName: string | null;
  showcaseOnHome: boolean;
  durationDays: number;
  grantedById: string;
  reason: string;
}

export interface BoostGrant extends BoostActivation {
  boostId: string;
}

/** Who stopped a boost and why; a refund also records its amount. */
export interface BoostStopInput {
  actorId: string | null;
  reason: string | null;
  /** Set when the stop is a refund (TL): added to `refundedAmount`. */
  refundedAmount?: Prisma.Decimal.Value;
}

export type BoostStopResult =
  | {
      stopped: true;
      boostId: string;
      productId: string;
      /** The boost's own time it did not use (search priority). */
      unconsumedSeconds: number;
    }
  | { stopped: false; status: BoostStatus | null };
