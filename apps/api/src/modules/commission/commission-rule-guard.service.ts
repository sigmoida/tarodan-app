import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { CommissionRuleSetStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import {
  canSellFromMembership,
  effectiveMembershipTierType,
} from "../membership/membership.util";
import {
  CommissionRuleMatchError,
  CommissionSellerConfigurationError,
  CorporateSellingSuspendedError,
  findMatchingCommissionRule,
  resolveCommissionSellerType,
  roundCommissionMatchAmount,
} from "../order/order-commission.helper";

export interface ListingCommissionGuardInput {
  sellerId: string;
  categoryId: string;
  amount: number;
}

/**
 * Ensures a listing can be priced by exactly one rule in the ACTIVE set before
 * it is persisted. This is deliberately an API invariant: web validation is
 * useful feedback, but must not be the only gate for direct API clients.
 */
@Injectable()
export class CommissionRuleGuardService {
  private readonly logger = new Logger(CommissionRuleGuardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertListingRuleExists({
    sellerId,
    categoryId,
    amount,
  }: ListingCommissionGuardInput): Promise<void> {
    const [activeSet, seller] = await Promise.all([
      this.prisma.commissionRuleSet.findFirst({
        where: { status: CommissionRuleSetStatus.ACTIVE },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: sellerId },
        select: {
          sellerType: true,
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
        },
      }),
    ]);

    if (
      !activeSet ||
      !seller ||
      !canSellFromMembership(seller.membership, seller)
    ) {
      this.reject({
        sellerId,
        categoryId,
        amount,
        sellerType: null,
        matchCount: 0,
      });
    }

    let sellerType;
    try {
      sellerType = resolveCommissionSellerType({
        userSellerType: seller.sellerType,
        membershipTier: effectiveMembershipTierType(seller.membership, seller),
        configuredMembershipTier: seller.membership?.tier.type,
        businessStatus: seller.businessStatus,
        companyName: seller.companyName,
        taxId: seller.taxId,
      });
    } catch (error) {
      if (
        error instanceof CommissionSellerConfigurationError ||
        error instanceof CorporateSellingSuspendedError
      ) {
        this.reject({
          sellerId,
          categoryId,
          amount,
          sellerType: null,
          matchCount: 0,
        });
      }
      throw error;
    }

    const normalizedAmount = roundCommissionMatchAmount(amount);
    const rules = await this.prisma.commissionRule.findMany({
      where: {
        ruleSetId: activeSet.id,
        categoryId,
        sellerType,
        minAmount: { lte: normalizedAmount },
        OR: [{ maxAmount: null }, { maxAmount: { gt: normalizedAmount } }],
      },
      select: {
        id: true,
        ruleSetId: true,
        name: true,
        categoryId: true,
        sellerType: true,
        minAmount: true,
        maxAmount: true,
      },
    });

    try {
      findMatchingCommissionRule(
        rules,
        { categoryId, sellerType, amount: normalizedAmount },
        this.logger,
      );
    } catch (error) {
      if (error instanceof CommissionRuleMatchError) {
        this.reject({
          sellerId,
          categoryId,
          amount: normalizedAmount,
          sellerType,
          matchCount: error.matchCount,
        });
      }
      throw error;
    }
  }

  private reject(details: {
    sellerId: string;
    categoryId: string;
    amount: number;
    sellerType: string | null;
    matchCount: number;
  }): never {
    this.logger.error(
      `Listing commission guard rejected seller=${details.sellerId} ` +
        `category=${details.categoryId} sellerType=${details.sellerType ?? "unresolved"} ` +
        `amount=${details.amount} matches=${details.matchCount}`,
    );
    throw new ConflictException({
      code: "LISTING_COMMISSION_RULE_UNAVAILABLE",
      message: i18nMessage("server.product.commissionRuleUnavailable"),
      details,
    });
  }
}
