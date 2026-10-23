import { Injectable } from "@nestjs/common";
import { MembershipTierType, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import {
  effectiveMembershipTierType,
  isPremiumEntitled,
} from "../../membership/helpers/membership.util";

/** The membership columns every entitlement rule reads (with the KYC owner). */
const MEMBERSHIP_SELECT = {
  status: true,
  currentPeriodEnd: true,
  tier: { select: { type: true, isActive: true } },
  user: {
    select: { businessStatus: true, companyName: true, taxId: true },
  },
} satisfies Prisma.UserMembershipSelect;

/**
 * The ad packages a seller may buy: open to everyone, or targeted at the
 * seller's effective membership tier or at the seller.
 */
export function eligibleAudienceWhere(
  userId: string,
  tierType: MembershipTierType,
): Prisma.AdPackageWhereInput {
  return {
    OR: [
      { audienceMode: "everyone" },
      {
        audienceMode: "membership_tiers",
        targetTiers: { some: { tierType } },
      },
      {
        audienceMode: "specific_users",
        targetUsers: { some: { userId } },
      },
      {
        audienceMode: "tiers_or_users",
        OR: [
          { targetTiers: { some: { tierType } } },
          { targetUsers: { some: { userId } } },
        ],
      },
    ],
  };
}

/**
 * Who a boost seller is to the boost rules: the effective membership tier the
 * package targeting matches, and whether the seller is premium (the
 * ending-soon reminder). One read of the membership with its KYC owner; the
 * rules are the membership module's (`effectiveMembershipTierType`,
 * `isPremiumEntitled`), so a lapsed period, an inactive tier or a revoked
 * business KYC count as "free" everywhere.
 */
@Injectable()
export class BoostAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  private membershipOf(userId: string) {
    return this.prisma.userMembership.findUnique({
      where: { userId },
      select: MEMBERSHIP_SELECT,
    });
  }

  /** The tier type package targeting matches ("free" without a valid membership). */
  async audienceTierType(userId: string): Promise<MembershipTierType> {
    const membership = await this.membershipOf(userId);
    return effectiveMembershipTierType(membership, membership?.user);
  }

  /** Whether the seller is a premium member now. */
  async isPremium(userId: string): Promise<boolean> {
    const membership = await this.membershipOf(userId);
    return isPremiumEntitled(membership, membership?.user);
  }
}
