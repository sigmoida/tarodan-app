import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { DiscountType, DiscountTarget, Prisma } from "@prisma/client";
import { audienceMatches } from "./helpers/discount-authorization";
import { resolveUserTier } from "./helpers/user-tier";
import { FeeDiscountResolver } from "./engine/fee-discount.resolver";

/**
 * Takas hizmet bedeline uygulanan kodsuz kampanyalar ve bunların TL bütçesi.
 * DiscountService'ten birebir taşındı.
 *
 * Kupon hattından ayrı durmasının sebebi tabanın farklı olması: burada
 * indirilen şey ürün fiyatı değil, platformun aldığı bedeldir — bu yüzden
 * kampanyanın bir TL bütçesi vardır ve bütçe kabulde harcanıp tam iadede geri
 * verilir. İkisi tek gövdede olsaydı bir kupon değişikliği bütçeyi sessizce
 * etkileyebilirdi.
 */
@Injectable()
export class DiscountTradeFeeService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly feeDiscountBudget?: FeeDiscountResolver,
  ) {}

  /**
   * Takas hizmet bedeli kampanyaları (İ25): kabul anında her katılımcının sabit
   * ücretine uygulanır. Kodsuz-otomatiktir; kitle eşleşmesi katılımcı bazında
   * yapılır (katılımcı bu bedelin "alıcısıdır"). En yüksek indirimi veren
   * kampanya kazanır; tutar bedeli ve kalan bütçeyi aşamaz.
   */
  async resolveTradeFeeDiscounts(
    parties: { userId: string; feeAmount: number }[],
  ): Promise<
    Map<string, { discountId: string; name: string; amount: number }>
  > {
    const result = new Map<
      string,
      { discountId: string; name: string; amount: number }
    >();
    const eligibleParties = parties.filter((party) => party.feeAmount > 0);
    if (!eligibleParties.length) return result;

    const now = new Date();
    const campaigns = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null,
        target: DiscountTarget.trade_service_fee,
        startDate: { lte: now },
        endDate: { gte: now },
        budgetStoppedAt: null,
      },
      orderBy: { priority: "asc" },
      include: {
        targetTiers: { select: { tierType: true } },
        targetUsers: { select: { userId: true } },
      },
    });
    if (!campaigns.length) return result;

    for (const party of eligibleParties) {
      const tier = await resolveUserTier(this.prisma, party.userId);
      let winner: { discountId: string; name: string; amount: number } | null =
        null;
      for (const campaign of campaigns) {
        const matches = audienceMatches({
          audience: campaign.audience,
          target: DiscountTarget.trade_service_fee,
          tierTypes: campaign.targetTiers.map((row) => row.tierType),
          userIds: campaign.targetUsers.map((row) => row.userId),
          buyerId: party.userId,
          buyerTier: tier,
        });
        if (!matches) continue;

        let amount =
          campaign.type === DiscountType.percentage
            ? party.feeAmount * (Number(campaign.value) / 100)
            : Math.min(Number(campaign.value), party.feeAmount);
        if (
          campaign.maxDiscountAmount != null &&
          amount > Number(campaign.maxDiscountAmount)
        ) {
          amount = Number(campaign.maxDiscountAmount);
        }
        const budgetRemaining =
          campaign.budgetLimit != null
            ? Math.max(
                0,
                Number(campaign.budgetLimit) -
                  Number(campaign.budgetSpent ?? 0),
              )
            : null;
        if (budgetRemaining != null && amount > budgetRemaining) {
          amount = budgetRemaining;
        }
        amount =
          Math.round(
            (Math.min(amount, party.feeAmount) + Number.EPSILON) * 100,
          ) / 100;
        if (amount <= 0) continue;
        if (!winner || amount > winner.amount) {
          winner = { discountId: campaign.id, name: campaign.name, amount };
        }
      }
      if (winner) result.set(party.userId, winner);
    }
    return result;
  }

  /** Takas kampanya bütçesi: kabulde harcanır (satır başına). */
  async spendTradeFeeBudget(
    entries: { discountId: string; amount: number }[],
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.feeDiscountBudget?.spendBudget(entries, client);
  }

  /** Takas kampanya bütçesi: bedel dahil TAM iadede geri döner. */
  async releaseTradeFeeBudget(
    entries: { discountId: string; amount: number }[],
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.feeDiscountBudget?.releaseBudget(entries, client);
  }
}
