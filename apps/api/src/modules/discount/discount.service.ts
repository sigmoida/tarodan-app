import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { SearchService } from "../search/search.service";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";
import { fulltextDiscountSearch } from "../../common/helpers/fulltext-search";
import { resolveOrderBy } from "../../common/list";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { generateReferenceCode } from "../../common/helpers/generate-reference";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
  ValidateCouponDto,
  DiscountResponseDto,
  PaginatedDiscountsDto,
  ValidationResultDto,
  ActiveCampaignDto,
} from "./dto";
import {
  DiscountScope,
  DiscountType,
  DiscountFundedBy,
  DiscountTarget,
  DiscountAudience,
  CouponReservationStatus,
  Prisma,
} from "@prisma/client";
import {
  assertAudienceConsistent,
  assertBudgetForTarget,
  assertCodeAllowedForTarget,
  assertSellerCampaignHasCode,
  assertTargetAllowedForActor,
  audienceMatches,
} from "./helpers/discount-authorization";
import { isProductInDiscountScope } from "./helpers/discount-scope";
import { FeeDiscountResolver } from "./engine/fee-discount.resolver";
import { DiscountUsageService } from "./discount-usage.service";
import { DiscountCrudService } from "./discount-crud.service";
import { DiscountPricingService } from "./discount-pricing.service";
import { DiscountCouponService } from "./discount-coupon.service";
import { resolveUserTier } from "./helpers/user-tier";
import { toDiscountResponse } from "./helpers/discount-response.mapper";
import { bestQuantityCampaignDiscount } from "./helpers/quantity-campaign";
import { i18nMessage } from "../i18n";

/** Kusursuz iadede geri verilen kupon hakkı — commit SONRASI bildirim için. */
export interface RestoredCoupon {
  userId: string;
  /** Yeniden kullanılabilecek kod (kişisel voucher ya da paylaşılan kod). */
  code: string;
  /** Kodun geçerlilik sonu; null = kampanya tarihi geçerli. */
  expiresAt: Date | null;
}

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly searchService: SearchService,
    private readonly usage: DiscountUsageService,
    private readonly crud: DiscountCrudService,
    private readonly pricing: DiscountPricingService,
    private readonly coupons: DiscountCouponService,
    @Optional()
    private readonly feeDiscountBudget?: FeeDiscountResolver,
  ) {}

  // ─────────────────────── kayıt yönetimi (CRUD) ───────────────────────
  // Controller ve admin bu servisi adresliyor; gövde DiscountCrudService'te.

  create(...args: Parameters<DiscountCrudService["create"]>) {
    return this.crud.create(...args);
  }

  update(...args: Parameters<DiscountCrudService["update"]>) {
    return this.crud.update(...args);
  }

  delete(...args: Parameters<DiscountCrudService["delete"]>) {
    return this.crud.delete(...args);
  }

  findOne(...args: Parameters<DiscountCrudService["findOne"]>) {
    return this.crud.findOne(...args);
  }

  findByCode(code: string): Promise<DiscountResponseDto | null> {
    return this.crud.findByCode(code);
  }

  findAll(...args: Parameters<DiscountCrudService["findAll"]>) {
    return this.crud.findAll(...args);
  }

  generateCodes(...args: Parameters<DiscountCrudService["generateCodes"]>) {
    return this.crud.generateCodes(...args);
  }

  listCodes(discountId: string) {
    return this.crud.listCodes(discountId);
  }

  // ────────────────────────── kupon doğrulama ──────────────────────────
  // Sepet önizlemesi ve checkout bu servisi adresliyor; gövde
  // DiscountCouponService'te.

  validateCoupon(...args: Parameters<DiscountCouponService["validateCoupon"]>) {
    return this.coupons.validateCoupon(...args);
  }

  computeCouponDiscount(
    ...args: Parameters<DiscountCouponService["computeCouponDiscount"]>
  ) {
    return this.coupons.computeCouponDiscount(...args);
  }

  resolveUserTier(userId: string): Promise<string | null> {
    return resolveUserTier(this.prisma, userId);
  }

  // ───────────────────────── kullanım defteri ─────────────────────────
  // Checkout, sipariş yaşam döngüsü, ödeme fulfillment/mutabakat, teklif ve
  // iade yolları bu servisi adresliyor; gövde DiscountUsageService'te.

  checkUsageLimit(discountId: string, userId: string): Promise<boolean> {
    return this.usage.checkUsageLimit(discountId, userId);
  }

  reserveUsage(...args: Parameters<DiscountUsageService["reserveUsage"]>) {
    return this.usage.reserveUsage(...args);
  }

  consumeReservedUsageForOrders(
    ...args: Parameters<DiscountUsageService["consumeReservedUsageForOrders"]>
  ) {
    return this.usage.consumeReservedUsageForOrders(...args);
  }

  revokeUsageForOrders(
    ...args: Parameters<DiscountUsageService["revokeUsageForOrders"]>
  ) {
    return this.usage.revokeUsageForOrders(...args);
  }

  releaseReservedUsageForOrders(
    ...args: Parameters<DiscountUsageService["releaseReservedUsageForOrders"]>
  ) {
    return this.usage.releaseReservedUsageForOrders(...args);
  }

  recordUsage(...args: Parameters<DiscountUsageService["recordUsage"]>) {
    return this.usage.recordUsage(...args);
  }

  // ─────────────────── kampanya fiyatı ve vitrini ───────────────────
  // Ürün listesi/detayı, sepet ve kampanya sayfası bu servisi adresliyor;
  // gövde DiscountPricingService'te.

  getEffectiveDisplayPrice(
    ...args: Parameters<DiscountPricingService["getEffectiveDisplayPrice"]>
  ) {
    return this.pricing.getEffectiveDisplayPrice(...args);
  }

  getEffectiveDisplayPriceMany(
    ...args: Parameters<DiscountPricingService["getEffectiveDisplayPriceMany"]>
  ) {
    return this.pricing.getEffectiveDisplayPriceMany(...args);
  }

  quantityDiscountsForLines(
    ...args: Parameters<DiscountPricingService["quantityDiscountsForLines"]>
  ) {
    return this.pricing.quantityDiscountsForLines(...args);
  }

  getActiveDiscountCriteria() {
    return this.pricing.getActiveDiscountCriteria();
  }

  getActiveCampaigns(): Promise<ActiveCampaignDto[]> {
    return this.pricing.getActiveCampaigns();
  }

  getProductDiscounts(
    ...args: Parameters<DiscountPricingService["getProductDiscounts"]>
  ) {
    return this.pricing.getProductDiscounts(...args);
  }

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
