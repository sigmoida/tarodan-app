import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
  CancelOrderDto,
  GuestCheckoutDto,
  GuestOrderTrackDto,
  DirectBuyDto,
  CheckoutQuoteDto,
  GuestSendVerificationCodeDto,
  CheckoutDto,
  GuestCheckoutGroupDto,
} from './dto';
import { OrderStatus, OfferStatus, ProductStatus, CommissionRuleType, SellerType, CommissionAppliesTo, CommissionSellerType, MembershipTierType, Prisma } from '@prisma/client';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { getAvailableQuantity } from '../product/helpers/product-availability.helper';
import { generateUniqueReference } from '../../common/helpers/generate-reference';
import { ProductLockService } from '../product/product-lock.service';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { DiscountService, DiscountCalculator } from '../discount';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { mapSuratFailureToHttpException } from '../surat-cargo/surat-result.mapper';
import type { SuratShipmentFailure } from '../surat-cargo/surat-cargo.types';
import { SuratKargoTuru, SuratOdemeTipi, SuratTasimaSekli, SuratTeslimSekli, SuratGonderiSekli } from '../surat-cargo/surat-cargo.types';

/**
 * Commission calculation result interface
 * Contains full details about the applied commission rule
 */
export interface CommissionResult {
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  commissionAmount: number; // total = buyerFee + sellerFee
  ruleId: string | null;
  ruleName: string | null;
  // Legacy fields for backward compatibility
  ruleType?: CommissionRuleType;
  appliedRate?: number;
  wasMinApplied?: boolean;
  wasMaxApplied?: boolean;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly discountService: DiscountService,
    private readonly discountCalculator: DiscountCalculator,
    private readonly suratCargoService: SuratCargoService,
    private readonly productLockService: ProductLockService,
    @Optional()
    private readonly storageService: StorageService,
    private readonly commissionLedger: CommissionLedgerService,
  ) {}

  // Shipping cost defaults (overridden by PlatformSetting)
  private readonly DEFAULT_SHIPPING_COST = 29.99;
  private readonly DEFAULT_FREE_THRESHOLD = 500;
  private shippingSettingsCache: { baseCost: number; freeThreshold: number; cachedAt: number } | null = null;

  /**
   * Load shipping cost settings from PlatformSetting (cached for 5 minutes).
   */
  private async getShippingSettings(): Promise<{ baseCost: number; freeThreshold: number }> {
    const now = Date.now();
    if (this.shippingSettingsCache && now - this.shippingSettingsCache.cachedAt < 5 * 60 * 1000) {
      return this.shippingSettingsCache;
    }

    const [baseSetting, thresholdSetting] = await Promise.all([
      this.prisma.platformSetting.findUnique({ where: { settingKey: 'shipping_base_cost' } }),
      this.prisma.platformSetting.findUnique({ where: { settingKey: 'free_shipping_threshold' } }),
    ]);

    const baseCost = baseSetting ? parseFloat(baseSetting.settingValue) : this.DEFAULT_SHIPPING_COST;
    const freeThreshold = thresholdSetting ? parseFloat(thresholdSetting.settingValue) : this.DEFAULT_FREE_THRESHOLD;

    this.shippingSettingsCache = { baseCost, freeThreshold, cachedAt: now };
    return { baseCost, freeThreshold };
  }

  /**
   * Calculate shipping cost based on order amount.
   * Reads from PlatformSetting (admin-configurable), falls back to defaults.
   */
  async calculateShippingCost(orderAmount: number): Promise<number> {
    const { baseCost, freeThreshold } = await this.getShippingSettings();
    if (orderAmount >= freeThreshold) {
      return 0;
    }
    return baseCost;
  }

  /**
   * Get free shipping info for frontend display
   */
  async getFreeShippingInfo(orderAmount: number): Promise<{
    isFreeShipping: boolean;
    shippingCost: number;
    threshold: number;
    amountToFreeShipping: number;
  }> {
    const { baseCost, freeThreshold } = await this.getShippingSettings();
    const shippingCost = orderAmount >= freeThreshold ? 0 : baseCost;
    return {
      isFreeShipping: shippingCost === 0,
      shippingCost,
      threshold: freeThreshold,
      amountToFreeShipping: Math.max(0, freeThreshold - orderAmount),
    };
  }

  /**
   * Get checkout quote (preview) for given items. Reuses same shipping and commission logic as order create.
   * Does not create any order; for display only. Final amounts are confirmed at order create.
   */
  async getCheckoutQuote(dto: CheckoutQuoteDto): Promise<{
    itemsSubtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      sellerNetAmount: number;
      title?: string;
    }>;
    pricing: {
      subtotal: number;
      shippingAmount: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      commissionAmount: number;
      totalAmount: number;
      sellerNetAmount: number;
    };
  }> {
    if (!dto.items?.length) {
      throw new BadRequestException('En az bir ürün gereklidir');
    }

    const now = new Date();
    let itemsSubtotal = 0;
    let totalBuyerFee = 0;
    let totalSellerFee = 0;
    const quoteItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      sellerNetAmount: number;
      title?: string;
    }> = [];

    for (const { productId, quantity = 1 } of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          title: true,
          price: true,
          oldPrice: true,
          saleStartDate: true,
          saleEndDate: true,
          sellerId: true,
          categoryId: true,
          status: true,
        },
      });

      if (!product) {
        throw new NotFoundException(`Ürün bulunamadı: ${productId}`);
      }
      if (product.status !== ProductStatus.active) {
        throw new BadRequestException(`Ürün satışta değil: ${product.title || productId}`);
      }

      const productPrice = Number(product.price);
      const isSaleActive =
        product.oldPrice != null &&
        (!product.saleStartDate || now >= new Date(product.saleStartDate)) &&
        (!product.saleEndDate || now <= new Date(product.saleEndDate));
      const unitPrice = isSaleActive && product.oldPrice != null
        ? productPrice
        : productPrice;
      const lineSubtotal = unitPrice * quantity;

      const commissionResult = await this.calculateCommission(
        lineSubtotal,
        product.sellerId,
        product.categoryId,
      );

      const lineBuyerFee = commissionResult.buyerFeeAmount;
      const lineSellerFee = commissionResult.sellerFeeAmount;
      const lineSellerNet = lineSubtotal - lineSellerFee;

      itemsSubtotal += lineSubtotal;
      totalBuyerFee += lineBuyerFee;
      totalSellerFee += lineSellerFee;

      quoteItems.push({
        productId: product.id,
        quantity,
        unitPrice,
        subtotal: lineSubtotal,
        buyerFeeAmount: lineBuyerFee,
        sellerFeeAmount: lineSellerFee,
        sellerNetAmount: Math.max(0, lineSellerNet),
        title: product.title ?? undefined,
      });
    }

    const shippingAmount = await this.calculateShippingCost(itemsSubtotal);
    const commissionAmount = totalBuyerFee + totalSellerFee;
    const totalAmount = itemsSubtotal + shippingAmount + totalBuyerFee;
    const sellerNetAmount = Math.max(0, itemsSubtotal - totalSellerFee);

    const pricing = {
      subtotal: itemsSubtotal,
      shippingAmount,
      buyerFeeAmount: totalBuyerFee,
      sellerFeeAmount: totalSellerFee,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };

    return {
      itemsSubtotal,
      shippingAmount,
      buyerFeeAmount: totalBuyerFee,
      sellerFeeAmount: totalSellerFee,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
      items: quoteItems,
      pricing,
    };
  }

  /**
   * Commission preview for listing create/edit. Given a price amount and optional category, returns estimated fees.
   * Used when product does not exist yet (e.g. seller entering price on create form). Reuses same logic as order/quote.
   */
  async getCommissionPreview(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
  ): Promise<{
    sellerFeeAmount: number;
    buyerFeeAmount: number;
    commissionAmount: number;
    sellerNetAmount: number;
  }> {
    const result = await this.calculateCommission(amount, sellerId, categoryId);
    const sellerNetAmount = Math.max(0, amount - result.sellerFeeAmount);
    return {
      sellerFeeAmount: result.sellerFeeAmount,
      buyerFeeAmount: result.buyerFeeAmount,
      commissionAmount: result.commissionAmount,
      sellerNetAmount,
    };
  }

  /**
   * Batch commission preview for multiple (amount, categoryId) pairs. Same order as input.
   */
  async getCommissionPreviewBatch(
    sellerId: string,
    items: Array<{ amount: number; categoryId?: string | null }>,
  ): Promise<{ results: Array<{ sellerFeeAmount: number; sellerNetAmount: number }> }> {
    const results = await Promise.all(
      items.map(async (item) => {
        const amount = Number(item.amount);
        if (Number.isNaN(amount) || amount < 0) {
          return { sellerFeeAmount: 0, sellerNetAmount: amount };
        }
        const preview = await this.getCommissionPreview(amount, sellerId, item.categoryId ?? null);
        return { sellerFeeAmount: preview.sellerFeeAmount, sellerNetAmount: preview.sellerNetAmount };
      }),
    );
    return { results };
  }

  private buildSuratIdempotencyKey(parts: string[]): string {
    return createHash('sha256').update(parts.filter((p) => p.length > 0).join('|')).digest('hex');
  }

  /**
   * Sürat gönderi oluşturma (edge case 1.7): SURAT_CARGO_ENABLED=true iken order.create öncesi fail-fast.
   */
  private async assertSuratShipmentSucceeded(ctx: {
    correlationId: string;
    idempotencyKey: string;
    recipientFullName: string;
    recipientPhone: string;
    recipientCity: string;
    recipientDistrict: string;
    recipientAddressLine: string;
    productId: string;
    productTitle?: string;
    orderNumberPreview: string;
  }): Promise<void> {
    if (!this.suratCargoService.isIntegrationEnabled()) {
      return;
    }

    const result = await this.suratCargoService.submitShipmentWithRetry({
      idempotencyKey: ctx.idempotencyKey,
      correlationId: ctx.correlationId,
      payload: {
        KisiKurum: ctx.recipientFullName,
        AliciAdresi: ctx.recipientAddressLine,
        Il: ctx.recipientCity,
        Ilce: ctx.recipientDistrict,
        TelefonCep: ctx.recipientPhone,
        SahisBirim: ctx.productTitle,
        KargoTuru: SuratKargoTuru.Koli,
        OdemeTipi: SuratOdemeTipi.Pesin,
        OzelKargoTakipNo: ctx.orderNumberPreview,
        Adet: 1,
        BirimDesi: 1,
        BirimKg: 1,
        KapidanOdemeTahsilatTipi: 1, // Nakit (zorunlu alan)
        TasimaSekli: SuratTasimaSekli.KaraYolu,
        TeslimSekli: SuratTeslimSekli.AdreseTeslim,
        GonderiSekli: SuratGonderiSekli.Standart,
        Pazaryerimi: 0,
        Iademi: false,
      },
    });

    if (result.ok) {
      return;
    }
    const failure = result as SuratShipmentFailure;
    this.logger.warn({
      msg: 'Surat shipment failed before order persist',
      correlationId: ctx.correlationId,
      idempotencyKey: ctx.idempotencyKey,
      failure,
    });
    if (failure.kind === 'business') {
      this.logger.warn(`Surat business message: ${failure.suratMessage}`);
    } else if (failure.cause?.stack) {
      this.logger.warn(failure.cause.stack);
    }
    mapSuratFailureToHttpException(failure);
  }

  /**
   * Invalidate product caches when product status changes
   */
  private async invalidateProductCaches(productId: string): Promise<void> {
    try {
      await this.cache.del(`products:detail:${productId}`);
      await this.cache.delPattern('products:list:*');
      this.logger.log(`Product cache invalidated for ${productId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate product cache: ${error}`);
    }
  }

  /**
   * Generate a non-guessable, unique order number (e.g. "ORD-K7X9M2QF3N").
   * Random by design so the value leaks no sequence/order-count information and
   * cannot be enumerated. The `order_number` column's @unique constraint is the
   * final guard against the (negligible) chance of a collision.
   */
  private async generateOrderNumber(): Promise<string> {
    return generateUniqueReference(
      'ORD',
      async (code) =>
        (await this.prisma.order.count({ where: { orderNumber: code } })) > 0,
    );
  }

  /**
   * Calculate commission based on rules with priority matching
   * Requirement: Admin Commission Calculation (3.3)
   * 
   * Matching hierarchy (by priority descending):
   * 1. Exact match: categoryId + sellerType
   * 2. Category match: categoryId only
   * 3. Seller type match: sellerType only
   * 4. Default rule: ruleType = 'default'
   * 
   * Applies min/max limits after calculation
   */
  async calculateCommission(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
  ): Promise<CommissionResult> {
    // Get seller info including membership tier
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        sellerType: true,
        membership: {
          include: {
            tier: {
              select: { type: true },
            },
          },
        },
      },
    });

    // Map User.sellerType to CommissionSellerType
    const commissionSellerType = this.mapSellerTypeForCommission(
      seller?.sellerType ?? null,
      seller?.membership?.tier?.type ?? null,
    );

    // Tüm aktif kuralları çek (Faz 5.1)
    const allActive = await this.prisma.commissionRule.findMany({
      where: { isActive: true },
      include: { category: true },
    });

    this.logger.debug(`Found ${allActive.length} active commission rules`);

    // SELLER tarafı: appliesTo IN (SELLER, BOTH)
    const sellerRules = allActive.filter(
      (r) =>
        r.appliesTo === CommissionAppliesTo.SELLER ||
        r.appliesTo === CommissionAppliesTo.BOTH,
    );
    const sellerMatch = this.findMatchingRule(
      sellerRules,
      categoryId,
      commissionSellerType,
    );

    // BUYER tarafı: appliesTo IN (BUYER, BOTH)
    const buyerRules = allActive.filter(
      (r) =>
        r.appliesTo === CommissionAppliesTo.BUYER ||
        r.appliesTo === CommissionAppliesTo.BOTH,
    );
    const buyerMatch = this.findMatchingRule(
      buyerRules,
      categoryId,
      commissionSellerType,
    );

    if (!sellerMatch && !buyerMatch) {
      this.logger.warn(
        'No matching commission rule found; applying 0 commission fallback',
      );
      return {
        buyerFeeAmount: 0,
        sellerFeeAmount: 0,
        commissionAmount: 0,
        ruleId: null,
        ruleName: null,
      };
    }

    const subtotal = amount;

    // Seller fee
    let sellerFee = 0;
    if (sellerMatch && sellerMatch.sellerRate) {
      const raw = subtotal * (Number(sellerMatch.sellerRate) / 100);
      sellerFee = this.clampAmount(
        raw,
        sellerMatch.sellerMin ? Number(sellerMatch.sellerMin) : null,
        sellerMatch.sellerMax ? Number(sellerMatch.sellerMax) : null,
      );
    }

    // Buyer fee
    let buyerFee = 0;
    if (buyerMatch && buyerMatch.buyerRate) {
      const raw = subtotal * (Number(buyerMatch.buyerRate) / 100);
      buyerFee = this.clampAmount(
        raw,
        buyerMatch.buyerMin ? Number(buyerMatch.buyerMin) : null,
        buyerMatch.buyerMax ? Number(buyerMatch.buyerMax) : null,
      );
    }

    const totalCommission = sellerFee + buyerFee;

    this.logger.log(
      `Commission: amount=${amount} sellerFee=${sellerFee} (rule=${sellerMatch?.id ?? 'none'}) buyerFee=${buyerFee} (rule=${buyerMatch?.id ?? 'none'})`,
    );

    // ruleId/ruleName legacy alanları: seller match öncelikli, yoksa buyer
    const primary = sellerMatch ?? buyerMatch;
    return {
      buyerFeeAmount: buyerFee,
      sellerFeeAmount: sellerFee,
      commissionAmount: totalCommission,
      ruleId: primary?.id ?? null,
      ruleName: primary?.name ?? null,
      ruleType: primary?.ruleType,
      appliedRate: sellerMatch?.sellerRate
        ? Number(sellerMatch.sellerRate)
        : buyerMatch?.buyerRate
          ? Number(buyerMatch.buyerRate)
          : 0,
    };
  }

  /**
   * Find matching commission rule by specificity
   * Order: 1) cat+type, 2) cat+ALL (kategori öncelikli), 3) type-only, 4) ALL+NULL
   * Each level can only have one rule (validated in admin service)
   */
  private findMatchingRule(
    rules: any[],
    categoryId: string | null | undefined,
    sellerType: CommissionSellerType
  ): any | null {
    // 1. categoryId + sellerType (most specific)
    if (categoryId) {
      const exact = rules.find(
        r => r.categoryId === categoryId && r.sellerType === sellerType
      );
      if (exact) {
        this.logger.debug(`Matched exact rule: category=${categoryId}, sellerType=${sellerType}`);
        return exact;
      }
    }

    // 2. categoryId + ALL (category priority - more specific than seller type)
    if (categoryId) {
      const catAll = rules.find(
        r => r.categoryId === categoryId && r.sellerType === CommissionSellerType.ALL
      );
      if (catAll) {
        this.logger.debug(`Matched category rule: category=${categoryId}, sellerType=ALL`);
        return catAll;
      }
    }

    // 3. categoryId IS NULL + sellerType
    const typeOnly = rules.find(
      r => r.categoryId === null && r.sellerType === sellerType
    );
    if (typeOnly) {
      this.logger.debug(`Matched seller type rule: sellerType=${sellerType}`);
      return typeOnly;
    }

    // 4. categoryId IS NULL + ALL (default)
    const defaultRule = rules.find(
      r => r.categoryId === null && r.sellerType === CommissionSellerType.ALL
    );
    
    if (defaultRule) {
      this.logger.debug('Using default commission rule (ALL+NULL)');
      return defaultRule;
    }

    return null;
  }

  /**
   * Clamp amount between min and max
   */
  private clampAmount(
    raw: number,
    min: number | null,
    max: number | null
  ): number {
    let val = raw;
    if (min != null && val < min) val = min;
    if (max != null && val > max) val = max;
    return Math.round(val * 100) / 100;
  }

  /**
   * Map User.sellerType to CommissionSellerType
   * individual/verified -> FREE
   * platform -> BUSINESS
   * Premium/Business membership -> PREMIUM
   */
  private mapSellerTypeForCommission(
    userSellerType: SellerType | null,
    membershipTier: MembershipTierType | null
  ): CommissionSellerType {
    // Premium/Business membership -> PREMIUM
    if (membershipTier === MembershipTierType.premium || membershipTier === MembershipTierType.business) {
      return CommissionSellerType.PREMIUM;
    }

    // Platform sellers -> BUSINESS
    if (userSellerType === SellerType.platform) {
      return CommissionSellerType.BUSINESS;
    }

    // Individual/Verified -> FREE
    return CommissionSellerType.FREE;
  }

  /**
   * Record commission data to analytics snapshot
   * Requirement: Store commission snapshot (3.3)
   */
  private async recordCommissionSnapshot(
    orderId: string,
    orderNumber: string,
    commissionAmount: number,
    totalAmount: number,
    result: CommissionResult,
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Try to update existing daily snapshot or create new one
      await this.prisma.analyticsSnapshot.upsert({
        where: {
          snapshotType_snapshotDate: {
            snapshotType: 'daily_commission',
            snapshotDate: today,
          },
        },
        update: {
          totalRevenue: {
            increment: commissionAmount,
          },
          newOrders: {
            increment: 1,
          },
          data: {
            // Note: In production, you'd merge this with existing data
            lastOrderId: orderId,
            lastOrderNumber: orderNumber,
            lastCommission: commissionAmount,
            lastRuleId: result.ruleId,
            lastRuleName: result.ruleName,
            lastAppliedRate: result.appliedRate,
          },
        },
        create: {
          snapshotType: 'daily_commission',
          snapshotDate: today,
          totalRevenue: commissionAmount,
          newOrders: 1,
          data: {
            orders: [{
              orderId,
              orderNumber,
              totalAmount,
              commissionAmount,
              ruleId: result.ruleId,
              ruleName: result.ruleName,
              appliedRate: result.appliedRate,
              wasMinApplied: result.wasMinApplied,
              wasMaxApplied: result.wasMaxApplied,
              timestamp: new Date().toISOString(),
            }],
          },
        },
      });

      this.logger.debug(`Commission snapshot recorded for order ${orderNumber}`);
    } catch (error) {
      // Don't fail the order if snapshot fails
      this.logger.error(`Failed to record commission snapshot: ${error}`);
    }
  }

  /**
   * Create direct order (Buy Now) with product row locking
   * POST /orders/buy
   * Requirement: Direct purchase flow (3.1)
   * Business Rules:
   * - Product must be ACTIVE status
   * - Uses row-level locking (FOR UPDATE) to prevent race conditions
   * - Buyer must have valid address
   * - Cannot buy own product
   */
  async createDirectOrder(buyerId: string, dto: DirectBuyDto) {
    this.logger.log(`[createDirectOrder] Starting order for buyer: ${buyerId}`);
    this.logger.log(`[createDirectOrder] DTO: ${JSON.stringify(dto)}`);
    
    // Validate DTO has necessary address info
    if (!dto.shippingAddressId && !dto.shippingAddress) {
      this.logger.error('[createDirectOrder] No shipping address provided');
      throw new BadRequestException('Teslimat adresi gereklidir (shippingAddressId veya shippingAddress)');
    }
    
    // Check if user is banned
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
      select: { isBanned: true },
    });

    if (buyer?.isBanned) {
      throw new ForbiddenException('Hesabınız banlanmış. Yeni sipariş oluşturamazsınız.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM products p
        WHERE p.id = ${dto.productId}
        FOR UPDATE
      `;
      if (!lockedRows?.length) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        include: {
          seller: {
            select: { id: true, displayName: true },
          },
        },
      });

      if (!product) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      // Aynı alıcının bu ürün için bekleyen (ödeme yapılmamış) siparişi varsa onu döndür, yeni sipariş açma
      const existingOrder = await tx.order.findFirst({
        where: {
          productId: dto.productId,
          buyerId,
          status: OrderStatus.pending_payment,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existingOrder) {
        const numTotal = Number(existingOrder.totalAmount);
        const numSubtotal = Number(existingOrder.subtotal);
        const numDiscount = Number(existingOrder.discountAmount || 0);
        return {
          orderId: existingOrder.id,
          orderNumber: existingOrder.orderNumber,
          totalAmount: numTotal,
          subtotal: numSubtotal,
          discountAmount: numDiscount,
          appliedCouponCode: (existingOrder.discountCode as string) ?? undefined,
          productId: dto.productId,
          paymentUrl: '',
          provider: 'paytr',
          existingOrder: true,
        };
      }

      // Ürün satışta değilse (sold, inactive vb.) hata ver
      if (product.status !== ProductStatus.active) {
        throw new BadRequestException('Bu ürün satışta değil veya başkası tarafından satın alınıyor');
      }

      // Adet bazlı stok kontrolü: müsait adet >= 1 olmalı
      const available = getAvailableQuantity(product);
      if (available !== null && available < 1) {
        throw new BadRequestException('Bu ürün stokta bulunmamaktadır');
      }

      // Cannot buy own product
      if (product.sellerId === buyerId) {
        throw new ForbiddenException('Kendi ürününüzü satın alamazsınız');
      }

      // Resolve shipping address - either from saved address or inline address
      let shippingAddress: any;
      let shippingAddressId: string | null = null;

      if (dto.shippingAddressId) {
        // Use saved address
        const savedAddress = await tx.address.findUnique({
          where: { id: dto.shippingAddressId },
        });

        if (!savedAddress || savedAddress.userId !== buyerId) {
          throw new BadRequestException('Geçersiz teslimat adresi');
        }
        shippingAddress = savedAddress;
        shippingAddressId = savedAddress.id;
      } else if (dto.shippingAddress) {
        // Validate required fields
        if (!dto.shippingAddress.fullName?.trim()) {
          throw new BadRequestException('Teslimat adresi için ad soyad gereklidir');
        }
        if (!dto.shippingAddress.phone?.trim()) {
          throw new BadRequestException('Teslimat adresi için telefon numarası gereklidir');
        }
        if (!dto.shippingAddress.city?.trim()) {
          throw new BadRequestException('Teslimat adresi için şehir gereklidir');
        }
        if (!dto.shippingAddress.district?.trim()) {
          throw new BadRequestException('Teslimat adresi için ilçe gereklidir');
        }
        if (!dto.shippingAddress.address?.trim()) {
          throw new BadRequestException('Teslimat adresi için açık adres gereklidir');
        }
        
        // Use inline address object - create a new address for the user
        const newAddress = await tx.address.create({
          data: {
            userId: buyerId,
            title: 'Sipariş Adresi',
            fullName: dto.shippingAddress.fullName.trim(),
            phone: dto.shippingAddress.phone.trim(),
            city: dto.shippingAddress.city.trim(),
            district: dto.shippingAddress.district.trim(),
            address: dto.shippingAddress.address.trim(),
            zipCode: dto.shippingAddress.zipCode?.trim() || null,
            isDefault: false,
          },
        });
        shippingAddress = newAddress;
        shippingAddressId = newAddress.id;
      } else {
        throw new BadRequestException('Teslimat adresi gereklidir');
      }

      // Resolve billing address: inline object > saved address ID > same as shipping
      let billingAddress = shippingAddress;
      if (dto.billingAddress && dto.billingAddress.fullName?.trim() && dto.billingAddress.city?.trim() && dto.billingAddress.address?.trim()) {
        // Inline billing address (no need to save in profile)
        billingAddress = {
          id: '',
          title: 'Fatura Adresi',
          fullName: dto.billingAddress.fullName.trim(),
          phone: (dto.billingAddress.phone || shippingAddress.phone || '').trim(),
          city: dto.billingAddress.city.trim(),
          district: (dto.billingAddress.district || '').trim(),
          address: dto.billingAddress.address.trim(),
          zipCode: dto.billingAddress.zipCode?.trim() || null,
        };
      } else if (dto.billingAddressId && dto.billingAddressId !== shippingAddressId) {
        const billing = await tx.address.findUnique({
          where: { id: dto.billingAddressId },
        });
        if (!billing || billing.userId !== buyerId) {
          throw new BadRequestException('Geçersiz fatura adresi');
        }
        billingAddress = billing;
      }

      // A + oldPrice: price (A) = güncel satış fiyatı; siparişte sadece price kullan
      const now = new Date();
      const productPrice = Number(product.price);
      const isSaleActive =
        product.oldPrice != null &&
        (!product.saleStartDate || now >= new Date(product.saleStartDate)) &&
        (!product.saleEndDate || now <= new Date(product.saleEndDate));
      const originalPrice = isSaleActive && product.oldPrice != null
        ? Number(product.oldPrice)
        : productPrice;
      const productDiscount = isSaleActive ? originalPrice - productPrice : 0;
      
      // Apply coupon discount if provided
      let couponDiscount = 0;
      let appliedCouponCode: string | null = null;
      let appliedDiscountId: string | null = null;
      
      if (dto.couponCode) {
        const validation = await this.discountService.validateCoupon(
          { 
            code: dto.couponCode, 
            cartItems: [{ productId: dto.productId, quantity: 1 }] 
          },
          buyerId,
        );
        
        if (validation.isValid && validation.discount) {
          couponDiscount = validation.discount.estimatedDiscount;
          appliedCouponCode = dto.couponCode.toUpperCase();
          appliedDiscountId = validation.discount.id;
        } else if (!validation.isValid) {
          throw new BadRequestException(validation.error || 'Kupon kodu geçersiz');
        }
      }
      
      // Calculate total discount and subtotal
      const totalDiscount = productDiscount + couponDiscount;
      const subtotal = originalPrice;
      const discountedPrice = productPrice - couponDiscount;

      // Calculate commission with category-based matching (3.3)
      // Commission is calculated on discounted product price, not including shipping
      const commissionResult = await this.calculateCommission(
        discountedPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Calculate shipping cost (free shipping for orders >= 500 TL)
      const shippingCost = await this.calculateShippingCost(discountedPrice);
      // Buyer fee is added to order total
      const totalAmount = discountedPrice + shippingCost + commissionResult.buyerFeeAmount;

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      const suratIdempotencyKey =
        dto.idempotencyKey?.trim() ||
        this.buildSuratIdempotencyKey([
          buyerId,
          dto.productId,
          String(shippingAddressId || ''),
          dto.shippingAddress
            ? `${dto.shippingAddress.city}|${dto.shippingAddress.phone}|${dto.shippingAddress.address}`
            : '',
          dto.couponCode || '',
        ]);

      await this.assertSuratShipmentSucceeded({
        correlationId: randomUUID(),
        idempotencyKey: suratIdempotencyKey,
        recipientFullName: shippingAddress.fullName,
        recipientPhone: shippingAddress.phone,
        recipientCity: shippingAddress.city,
        recipientDistrict: shippingAddress.district,
        recipientAddressLine: shippingAddress.address,
        productId: dto.productId,
        productTitle: product.title ?? undefined,
        orderNumberPreview: orderNumber,
      });

      // Adet bazlı rezervasyon: 1 adet rezerve et (stok ödeme tamamlanınca düşer)
      // Invalidation yapılmıyor — cron halledecek (stock_plan.md)
      await tx.product.update({
        where: { id: dto.productId },
        data: { reservedQuantity: { increment: 1 } },
      });

      // Build shippingAddress JSON; add billing snapshot when different from shipping
      const shippingAddressJson: Record<string, unknown> = {
        id: shippingAddress.id,
        title: shippingAddress.title || 'Teslimat Adresi',
        fullName: shippingAddress.fullName,
        phone: shippingAddress.phone,
        city: shippingAddress.city,
        district: shippingAddress.district,
        address: shippingAddress.address,
        zipCode: shippingAddress.zipCode,
      };
      if (this.suratCargoService.isIntegrationEnabled()) {
        shippingAddressJson.suratIdempotencyKey = suratIdempotencyKey;
      }
      if (billingAddress !== shippingAddress) {
        (shippingAddressJson as any).billingAddress = {
          fullName: billingAddress.fullName,
          phone: billingAddress.phone,
          city: billingAddress.city,
          district: billingAddress.district,
          address: billingAddress.address,
          zipCode: billingAddress.zipCode,
        };
      }

      // Tek siparişlik grup: legacy yol da CheckoutGroup oluşturur (grup numarası
      // backfill konvansiyonuyla aynı: 'GRP' + orderNumber → uniqueness garantili)
      const singleOrderGroup = await tx.checkoutGroup.create({
        data: {
          groupNumber: `GRP${orderNumber}`,
          buyerId,
          totalAmount,
          isGuest: false,
        },
      });

      // Create order with discount info
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: dto.productId,
          buyerId,
          sellerId: product.sellerId,
          checkoutGroupId: singleOrderGroup.id,
          totalAmount,
          subtotal,
          discountAmount: totalDiscount,
          discountCode: appliedCouponCode,
          discountBreakdown: totalDiscount > 0 ? {
            productDiscount,
            couponDiscount,
            appliedDiscountId,
            originalPrice,
          } : undefined,
          shippingCost,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddressId: shippingAddressId,
          shippingAddress: shippingAddressJson as Prisma.InputJsonValue,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, email: true, displayName: true },
          },
          seller: {
            select: { id: true, email: true, displayName: true },
          },
        },
      });

      // Record commission snapshot for analytics (3.3)
      await this.recordCommissionSnapshot(
        order.id,
        orderNumber,
        commissionResult.commissionAmount,
        totalAmount,
        commissionResult,
      );

      // Record discount usage if a coupon was applied
      if (appliedDiscountId && couponDiscount > 0) {
        await this.discountService.recordUsage(
          appliedDiscountId,
          buyerId,
          order.id,
          couponDiscount,
        );
        this.logger.log(`Discount usage recorded: ${appliedDiscountId} for order ${orderNumber}`);
      }

      // Emit order.created event (outside transaction but still in the method)
      // This sends notification emails and push notifications
      try {
        const createdOrder = order as typeof order & { product: { title: string }; buyer: { email: string; displayName: string | null }; seller: { email: string | null; displayName: string | null } };
        await this.eventService.emitOrderCreated({
          orderId: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          buyerId: createdOrder.buyerId,
          sellerId: createdOrder.sellerId,
          productId: createdOrder.productId,
          productTitle: createdOrder.product.title,
          totalAmount,
          buyerEmail: createdOrder.buyer.email,
          buyerName: createdOrder.buyer.displayName || createdOrder.buyer.email,
          sellerEmail: createdOrder.seller.email || '',
          sellerName: createdOrder.seller.displayName || 'Satıcı',
        });
        this.logger.log(`order.created event emitted for order ${createdOrder.orderNumber}`);
      } catch (error) {
        // Log but don't fail the order creation
        this.logger.error(`Failed to emit order.created event: ${error}`);
      }

      // Return response with payment info (payment URL will be generated by PaymentService)
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount,
        subtotal,
        discountAmount: totalDiscount,
        appliedCouponCode: appliedCouponCode ?? undefined,
        productId: dto.productId,
        paymentUrl: '',
        provider: 'paytr',
      };
    });

    // Invalidate product cache after successful transaction
    await this.invalidateProductCaches(result.productId);

    return result;
  }

  /**
   * Batch checkout (üye): sepetteki tüm ürünler tek çağrıda, tek CheckoutGroup
   * altında sipariş edilir. Tek ödeme tüm grubu kapsar (payment.checkoutGroupId).
   * POST /orders/checkout
   */
  async checkout(buyerId: string, dto: CheckoutDto) {
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
      select: { isBanned: true },
    });
    if (buyer?.isBanned) {
      throw new ForbiddenException('Hesabınız banlanmış. Yeni sipariş oluşturamazsınız.');
    }

    return this.createCheckoutGroup({ buyerId, dto, isGuest: false });
  }

  /**
   * Batch checkout (misafir): OTP grup için bir kez tüketilir.
   * POST /orders/checkout/guest
   */
  async checkoutGuest(dto: GuestCheckoutGroupDto) {
    // İdempotensi OTP tüketiminden ÖNCE: replay yeni kod istememeli
    const replayed = await this.findCheckoutGroupReplay(dto.idempotencyKey);
    if (replayed) {
      return replayed;
    }

    const normEmail = this.normalizeGuestCheckoutEmail(dto.email);
    await this.consumeGuestCheckoutOtp(normEmail, dto.emailVerificationCode);

    if (!dto.shippingAddress) {
      throw new BadRequestException('Teslimat adresi gereklidir');
    }

    const guestUser = await this.getOrCreateSystemGuestUser();

    return this.createCheckoutGroup({
      buyerId: guestUser.id,
      dto,
      isGuest: true,
      guest: {
        email: normEmail,
        phone: dto.phone?.trim(),
        name: dto.guestName?.trim(),
      },
    });
  }

  private async getOrCreateSystemGuestUser() {
    const SYSTEM_GUEST_EMAIL = 'guest@tarodan.system';
    const existing = await this.prisma.user.findUnique({
      where: { email: SYSTEM_GUEST_EMAIL },
    });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        email: SYSTEM_GUEST_EMAIL,
        displayName: 'GUEST_SYSTEM',
        passwordHash: '',
        isVerified: false,
        isSeller: false,
      },
    });
  }

  private formatCheckoutGroupCreateResponse(group: {
    id: string;
    groupNumber: string;
    totalAmount: Prisma.Decimal | number;
    orders: Array<{
      id: string;
      orderNumber: string;
      productId: string;
      totalAmount: Prisma.Decimal | number;
      subtotal: Prisma.Decimal | number | null;
      discountAmount: Prisma.Decimal | number;
      discountCode: string | null;
    }>;
  }) {
    return {
      checkoutGroupId: group.id,
      groupNumber: group.groupNumber,
      totalAmount: Number(group.totalAmount),
      orders: group.orders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        productId: o.productId,
        totalAmount: Number(o.totalAmount),
        subtotal: o.subtotal != null ? Number(o.subtotal) : undefined,
        discountAmount: Number(o.discountAmount || 0),
        appliedCouponCode: o.discountCode ?? undefined,
      })),
      provider: 'paytr',
      paymentUrl: '',
    };
  }

  private async findCheckoutGroupReplay(idempotencyKey: string, buyerId?: string) {
    const existing = await this.prisma.checkoutGroup.findUnique({
      where: { idempotencyKey },
      include: { orders: true },
    });
    if (!existing) return null;
    if (buyerId && existing.buyerId !== buyerId) {
      throw new ForbiddenException('Bu işlem size ait değil');
    }
    return { ...this.formatCheckoutGroupCreateResponse(existing), existingGroup: true };
  }

  private async createCheckoutGroup(params: {
    buyerId: string;
    dto: CheckoutDto;
    isGuest: boolean;
    guest?: { email: string; phone?: string; name?: string };
  }) {
    const { buyerId, dto, isGuest, guest } = params;

    if (!isGuest) {
      const replayed = await this.findCheckoutGroupReplay(dto.idempotencyKey, buyerId);
      if (replayed) return replayed;
    }

    if (!dto.shippingAddressId && !dto.shippingAddress) {
      throw new BadRequestException(
        'Teslimat adresi gereklidir (shippingAddressId veya shippingAddress)',
      );
    }
    if (isGuest && dto.couponCode) {
      throw new BadRequestException('Kupon kodu misafir alışverişte desteklenmiyor');
    }

    // Dedupe + sıralı kilitleme (deadlock önleme)
    const productIds = [...new Set(dto.items.map((i) => i.productId))].sort();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const lockedRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT p.id
          FROM products p
          WHERE p.id IN (${Prisma.join(productIds)})
          ORDER BY p.id
          FOR UPDATE
        `;
        if ((lockedRows?.length ?? 0) !== productIds.length) {
          throw new NotFoundException('Sepetteki ürünlerden biri bulunamadı');
        }

        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: {
            seller: { select: { id: true, email: true, displayName: true } },
          },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        // Ürün doğrulamaları — hata gövdesinde productId döner (istemci stok ekranına yönlendirir)
        for (const productId of productIds) {
          const product = productMap.get(productId);
          if (!product) {
            throw new NotFoundException('Sepetteki ürünlerden biri bulunamadı');
          }
          if (product.status !== ProductStatus.active) {
            throw new BadRequestException({
              message: `"${product.title}" satışta değil veya başkası tarafından satın alınıyor`,
              productId,
            });
          }
          const available = getAvailableQuantity(product);
          if (available !== null && available < 1) {
            throw new BadRequestException({
              message: `"${product.title}" stokta bulunmamaktadır`,
              productId,
            });
          }
          if (!isGuest && product.sellerId === buyerId) {
            throw new ForbiddenException('Kendi ürününüzü satın alamazsınız');
          }
        }

        // Aynı alıcının aynı ürün için eski bekleyen siparişi varsa iptal et ve
        // rezervasyonunu bırak — yoksa terk edilmiş checkout rezervasyonu yeni
        // denemede "stokta yok" hatasına yol açar (createDirectOrder'daki reuse'un grup karşılığı).
        if (!isGuest) {
          const staleOrders = await tx.order.findMany({
            where: {
              buyerId,
              productId: { in: productIds },
              status: OrderStatus.pending_payment,
            },
          });
          for (const stale of staleOrders) {
            await tx.order.update({
              where: { id: stale.id },
              data: {
                status: OrderStatus.cancelled,
                cancelReason: 'Yeni toplu sipariş ile değiştirildi',
                reservationReleasedAt: stale.reservationReleasedAt ?? new Date(),
              },
            });
            if (!stale.reservationReleasedAt) {
              await tx.product.update({
                where: { id: stale.productId },
                data: { reservedQuantity: { decrement: 1 } },
              });
            }
          }
        }

        // Adres çözümü (grup için bir kez)
        let shippingAddress: any;
        let shippingAddressId: string | null = null;

        if (!isGuest && dto.shippingAddressId) {
          const savedAddress = await tx.address.findUnique({
            where: { id: dto.shippingAddressId },
          });
          if (!savedAddress || savedAddress.userId !== buyerId) {
            throw new BadRequestException('Geçersiz teslimat adresi');
          }
          shippingAddress = savedAddress;
          shippingAddressId = savedAddress.id;
        } else if (dto.shippingAddress) {
          const addr = dto.shippingAddress;
          if (!addr.fullName?.trim()) {
            throw new BadRequestException('Teslimat adresi için ad soyad gereklidir');
          }
          if (!addr.phone?.trim()) {
            throw new BadRequestException('Teslimat adresi için telefon numarası gereklidir');
          }
          if (!addr.city?.trim()) {
            throw new BadRequestException('Teslimat adresi için şehir gereklidir');
          }
          if (!addr.district?.trim()) {
            throw new BadRequestException('Teslimat adresi için ilçe gereklidir');
          }
          if (!addr.address?.trim()) {
            throw new BadRequestException('Teslimat adresi için açık adres gereklidir');
          }
          if (isGuest) {
            shippingAddress = {
              id: '',
              title: 'Teslimat Adresi',
              fullName: addr.fullName.trim(),
              phone: addr.phone.trim(),
              city: addr.city.trim(),
              district: addr.district.trim(),
              address: addr.address.trim(),
              zipCode: addr.zipCode?.trim() || null,
            };
          } else {
            const newAddress = await tx.address.create({
              data: {
                userId: buyerId,
                title: 'Sipariş Adresi',
                fullName: addr.fullName.trim(),
                phone: addr.phone.trim(),
                city: addr.city.trim(),
                district: addr.district.trim(),
                address: addr.address.trim(),
                zipCode: addr.zipCode?.trim() || null,
                isDefault: false,
              },
            });
            shippingAddress = newAddress;
            shippingAddressId = newAddress.id;
          }
        } else {
          throw new BadRequestException('Teslimat adresi gereklidir');
        }

        // Fatura adresi: inline > kayıtlı ID > teslimatla aynı
        let billingAddress = shippingAddress;
        if (
          dto.billingAddress &&
          dto.billingAddress.fullName?.trim() &&
          dto.billingAddress.city?.trim() &&
          dto.billingAddress.address?.trim()
        ) {
          billingAddress = {
            id: '',
            title: 'Fatura Adresi',
            fullName: dto.billingAddress.fullName.trim(),
            phone: (dto.billingAddress.phone || shippingAddress.phone || '').trim(),
            city: dto.billingAddress.city.trim(),
            district: (dto.billingAddress.district || '').trim(),
            address: dto.billingAddress.address.trim(),
            zipCode: dto.billingAddress.zipCode?.trim() || null,
          };
        } else if (
          !isGuest &&
          dto.billingAddressId &&
          dto.billingAddressId !== shippingAddressId
        ) {
          const billing = await tx.address.findUnique({
            where: { id: dto.billingAddressId },
          });
          if (!billing || billing.userId !== buyerId) {
            throw new BadRequestException('Geçersiz fatura adresi');
          }
          billingAddress = billing;
        }

        // Fiyatlandırma (ürün başına) — createDirectOrder ile aynı kurallar
        const now = new Date();
        const pricing = productIds.map((productId) => {
          const product = productMap.get(productId)!;
          const productPrice = Number(product.price);
          const isSaleActive =
            product.oldPrice != null &&
            (!product.saleStartDate || now >= new Date(product.saleStartDate)) &&
            (!product.saleEndDate || now <= new Date(product.saleEndDate));
          const originalPrice =
            isSaleActive && product.oldPrice != null ? Number(product.oldPrice) : productPrice;
          return {
            productId,
            product,
            productPrice,
            originalPrice,
            productDiscount: isSaleActive ? originalPrice - productPrice : 0,
            couponDiscount: 0,
          };
        });

        // Kupon: tüm sepetle bir kez doğrula, indirimi fiyat oranında dağıt
        let appliedCouponCode: string | null = null;
        let appliedDiscountId: string | null = null;
        if (dto.couponCode) {
          const validation = await this.discountService.validateCoupon(
            {
              code: dto.couponCode,
              cartItems: productIds.map((productId) => ({ productId, quantity: 1 })),
            },
            buyerId,
          );
          if (!validation.isValid) {
            throw new BadRequestException(validation.error || 'Kupon kodu geçersiz');
          }
          if (validation.discount) {
            appliedCouponCode = dto.couponCode.toUpperCase();
            appliedDiscountId = validation.discount.id;
            const totalCoupon = validation.discount.estimatedDiscount;
            const priceSum = pricing.reduce((sum, p) => sum + p.productPrice, 0);
            let allocated = 0;
            pricing.forEach((p, idx) => {
              if (idx === pricing.length - 1) {
                p.couponDiscount = Math.round((totalCoupon - allocated) * 100) / 100;
              } else {
                p.couponDiscount =
                  Math.round(((totalCoupon * p.productPrice) / priceSum) * 100) / 100;
                allocated += p.couponDiscount;
              }
            });
          }
        }

        // Grup + sipariş numaraları
        const groupNumber = await generateUniqueReference(
          'GRP',
          async (code) =>
            (await this.prisma.checkoutGroup.count({ where: { groupNumber: code } })) > 0,
        );

        const paymentExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const orderInputs: Array<{
          pricingEntry: (typeof pricing)[number];
          orderNumber: string;
          commissionResult: CommissionResult;
          shippingCost: number;
          totalAmount: number;
          suratIdempotencyKey: string;
        }> = [];

        for (const entry of pricing) {
          const discountedPrice = entry.productPrice - entry.couponDiscount;
          const commissionResult = await this.calculateCommission(
            discountedPrice,
            entry.product.sellerId,
            entry.product.categoryId,
          );
          const shippingCost = await this.calculateShippingCost(discountedPrice);
          const totalAmount =
            discountedPrice + shippingCost + commissionResult.buyerFeeAmount;
          const orderNumber = await this.generateOrderNumber();
          const suratIdempotencyKey = this.buildSuratIdempotencyKey([
            dto.idempotencyKey,
            entry.productId,
          ]);

          // Sürat gönderisi sipariş satırlarından ÖNCE fail-fast: biri başarısızsa hiç sipariş oluşmaz
          await this.assertSuratShipmentSucceeded({
            correlationId: randomUUID(),
            idempotencyKey: suratIdempotencyKey,
            recipientFullName: shippingAddress.fullName,
            recipientPhone: shippingAddress.phone,
            recipientCity: shippingAddress.city,
            recipientDistrict: shippingAddress.district,
            recipientAddressLine: shippingAddress.address,
            productId: entry.productId,
            productTitle: entry.product.title ?? undefined,
            orderNumberPreview: orderNumber,
          });

          orderInputs.push({
            pricingEntry: entry,
            orderNumber,
            commissionResult,
            shippingCost,
            totalAmount,
            suratIdempotencyKey,
          });
        }

        const groupTotalAmount = orderInputs.reduce((sum, o) => sum + o.totalAmount, 0);

        const group = await tx.checkoutGroup.create({
          data: {
            groupNumber,
            buyerId,
            idempotencyKey: dto.idempotencyKey,
            totalAmount: groupTotalAmount,
            isGuest,
          },
        });

        const createdOrders: Array<{
          id: string;
          orderNumber: string;
          productId: string;
          totalAmount: number;
          subtotal: number;
          discountAmount: number;
          productTitle: string;
          sellerId: string;
          sellerEmail: string | null;
          sellerName: string | null;
        }> = [];

        for (const input of orderInputs) {
          const entry = input.pricingEntry;
          const totalDiscount = entry.productDiscount + entry.couponDiscount;

          const shippingAddressJson: Record<string, unknown> = {
            id: shippingAddress.id,
            title: shippingAddress.title || 'Teslimat Adresi',
            fullName: shippingAddress.fullName,
            phone: shippingAddress.phone,
            city: shippingAddress.city,
            district: shippingAddress.district,
            address: shippingAddress.address,
            zipCode: shippingAddress.zipCode,
          };
          if (isGuest && guest) {
            shippingAddressJson.guestName = guest.name || shippingAddress.fullName;
            shippingAddressJson.guestEmail = guest.email;
            shippingAddressJson.guestPhone = guest.phone;
            shippingAddressJson.isGuestOrder = true;
          }
          if (this.suratCargoService.isIntegrationEnabled()) {
            shippingAddressJson.suratIdempotencyKey = input.suratIdempotencyKey;
          }
          if (billingAddress !== shippingAddress) {
            (shippingAddressJson as any).billingAddress = {
              fullName: billingAddress.fullName,
              phone: billingAddress.phone,
              city: billingAddress.city,
              district: billingAddress.district,
              address: billingAddress.address,
              zipCode: billingAddress.zipCode,
            };
          }

          const order = await tx.order.create({
            data: {
              orderNumber: input.orderNumber,
              productId: entry.productId,
              buyerId,
              sellerId: entry.product.sellerId,
              checkoutGroupId: group.id,
              totalAmount: input.totalAmount,
              subtotal: entry.originalPrice,
              discountAmount: totalDiscount,
              discountCode: entry.couponDiscount > 0 ? appliedCouponCode : null,
              discountBreakdown:
                totalDiscount > 0
                  ? {
                      productDiscount: entry.productDiscount,
                      couponDiscount: entry.couponDiscount,
                      appliedDiscountId,
                      originalPrice: entry.originalPrice,
                    }
                  : undefined,
              shippingCost: input.shippingCost,
              commissionAmount: input.commissionResult.commissionAmount,
              buyerFeeAmount: input.commissionResult.buyerFeeAmount,
              sellerFeeAmount: input.commissionResult.sellerFeeAmount,
              status: OrderStatus.pending_payment,
              paymentExpiresAt,
              shippingAddressId,
              shippingAddress: shippingAddressJson as Prisma.InputJsonValue,
            },
          });

          await this.recordCommissionSnapshot(
            order.id,
            input.orderNumber,
            input.commissionResult.commissionAmount,
            input.totalAmount,
            input.commissionResult,
          );

          if (appliedDiscountId && entry.couponDiscount > 0) {
            await this.discountService.recordUsage(
              appliedDiscountId,
              buyerId,
              order.id,
              entry.couponDiscount,
            );
          }

          await tx.product.update({
            where: { id: entry.productId },
            data: { reservedQuantity: { increment: 1 } },
          });

          createdOrders.push({
            id: order.id,
            orderNumber: order.orderNumber,
            productId: entry.productId,
            totalAmount: input.totalAmount,
            subtotal: entry.originalPrice,
            discountAmount: totalDiscount,
            productTitle: entry.product.title,
            sellerId: entry.product.sellerId,
            sellerEmail: entry.product.seller?.email ?? null,
            sellerName: entry.product.seller?.displayName ?? null,
          });
        }

        return { group, createdOrders };
      },
      { timeout: 60000 },
    );

    // Cache invalidation + order.created eventleri (tx dışı; hata sipariş oluşumunu bozmaz)
    const buyerUser = isGuest
      ? null
      : await this.prisma.user.findUnique({
          where: { id: buyerId },
          select: { email: true, displayName: true },
        });

    for (const order of result.createdOrders) {
      await this.invalidateProductCaches(order.productId);
      try {
        await this.eventService.emitOrderCreated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          buyerId,
          sellerId: order.sellerId,
          productId: order.productId,
          productTitle: order.productTitle,
          totalAmount: order.totalAmount,
          buyerEmail: isGuest ? guest?.email || '' : buyerUser?.email || '',
          buyerName: isGuest
            ? guest?.name || 'Misafir'
            : buyerUser?.displayName || buyerUser?.email || '',
          sellerEmail: order.sellerEmail || '',
          sellerName: order.sellerName || 'Satıcı',
        });
      } catch (error) {
        this.logger.error(`Failed to emit order.created event: ${error}`);
      }
    }

    return {
      checkoutGroupId: result.group.id,
      groupNumber: result.group.groupNumber,
      totalAmount: Number(result.group.totalAmount),
      orders: result.createdOrders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        productId: o.productId,
        totalAmount: o.totalAmount,
        subtotal: o.subtotal,
        discountAmount: o.discountAmount,
        appliedCouponCode: o.discountAmount > 0 ? (dto.couponCode ?? undefined) : undefined,
      })),
      provider: 'paytr',
      paymentUrl: '',
    };
  }

  /**
   * Create order from accepted offer
   * POST /orders
   * Business Rules:
   * - Offer must be accepted
   * - Only buyer can create order
   * - Addresses must belong to buyer
   * - Commission is calculated automatically
   */
  async create(buyerId: string, dto: CreateOrderDto) {
    // Check if user is banned
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
      select: { isBanned: true },
    });

    if (buyer?.isBanned) {
      throw new ForbiddenException('Hesabınız banlanmış. Yeni sipariş oluşturamazsınız.');
    }
    let productIdForCache: string | null = null;
    
    const result = await this.prisma.$transaction(async (tx) => {
      // Get and validate offer
      const offer = await tx.offer.findUnique({
        where: { id: dto.offerId },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });

      if (!offer) {
        throw new NotFoundException('Teklif bulunamadı');
      }

      // Only buyer can create order
      if (offer.buyerId !== buyerId) {
        throw new ForbiddenException('Bu tekliften sipariş oluşturma yetkiniz yok');
      }

      // Offer must be accepted
      if (offer.status !== OfferStatus.accepted) {
        throw new BadRequestException('Sadece kabul edilmiş tekliflerden sipariş oluşturulabilir');
      }

      // Check if order already exists for this offer
      const existingOrder = await tx.order.findFirst({
        where: { offerId: dto.offerId },
      });

      if (existingOrder) {
        throw new BadRequestException('Bu teklif için zaten bir sipariş mevcut');
      }

      // Validate shipping address belongs to buyer
      const shippingAddress = await tx.address.findUnique({
        where: { id: dto.shippingAddressId },
      });

      if (!shippingAddress || shippingAddress.userId !== buyerId) {
        throw new BadRequestException('Geçersiz teslimat adresi');
      }

      // Validate billing address if provided
      const billingAddressId = dto.billingAddressId || dto.shippingAddressId;
      if (dto.billingAddressId) {
        const billingAddress = await tx.address.findUnique({
          where: { id: dto.billingAddressId },
        });

        if (!billingAddress || billingAddress.userId !== buyerId) {
          throw new BadRequestException('Geçersiz fatura adresi');
        }
      }

      // Calculate commission with category-based matching (3.3)
      const commissionResult = await this.calculateCommission(
        Number(offer.amount),
        offer.sellerId,
        offer.product.categoryId, // Pass categoryId for priority-based matching
      );

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      const suratIdempotencyKeyOffer =
        dto.idempotencyKey?.trim() ||
        this.buildSuratIdempotencyKey([buyerId, dto.offerId, dto.shippingAddressId]);

      await this.assertSuratShipmentSucceeded({
        correlationId: randomUUID(),
        idempotencyKey: suratIdempotencyKeyOffer,
        recipientFullName: shippingAddress.fullName,
        recipientPhone: shippingAddress.phone,
        recipientCity: shippingAddress.city,
        recipientDistrict: shippingAddress.district,
        recipientAddressLine: shippingAddress.address,
        productId: offer.productId,
        productTitle: offer.product.title ?? undefined,
        orderNumberPreview: orderNumber,
      });

      // Buyer fee is added to order total
      const totalAmount = Number(offer.amount) + commissionResult.buyerFeeAmount;

      const offerShippingJson: Record<string, unknown> | undefined = shippingAddress
        ? {
            id: shippingAddress.id,
            title: shippingAddress.title,
            fullName: shippingAddress.fullName,
            phone: shippingAddress.phone,
            city: shippingAddress.city,
            district: shippingAddress.district,
            address: shippingAddress.address,
            zipCode: shippingAddress.zipCode,
          }
        : undefined;
      if (offerShippingJson && this.suratCargoService.isIntegrationEnabled()) {
        offerShippingJson.suratIdempotencyKey = suratIdempotencyKeyOffer;
      }

      // Tek siparişlik grup (teklif yolu)
      const offerOrderGroup = await tx.checkoutGroup.create({
        data: {
          groupNumber: `GRP${orderNumber}`,
          buyerId,
          totalAmount,
          isGuest: false,
        },
      });

      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: offer.productId,
          buyerId,
          sellerId: offer.sellerId,
          offerId: dto.offerId,
          checkoutGroupId: offerOrderGroup.id,
          totalAmount,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddressId: dto.shippingAddressId,
          shippingAddress: offerShippingJson as Prisma.InputJsonValue | undefined,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
          },
        },
      });

      // Record commission snapshot for analytics (3.3)
      await this.recordCommissionSnapshot(
        order.id,
        orderNumber,
        commissionResult.commissionAmount,
        Number(offer.amount),
        commissionResult,
      );

      // Rezervasyon teklif kabul edildiğinde (offer.service accept) yapıldı; burada tekrar yapmıyoruz.

      // Store productId for cache invalidation
      productIdForCache = offer.productId;

      return await this.formatOrderResponse(order, buyerId);
    });

    // Invalidate product cache after successful transaction
    if (productIdForCache) {
      await this.invalidateProductCaches(productIdForCache);
      
      // Send notifications about product sold
      await this.sendProductSoldNotifications(productIdForCache, result.seller?.id);
    }
    
    return result;
  }

  /**
   * Send notifications when product is sold
   */
  private async sendProductSoldNotifications(productId: string, sellerId?: string): Promise<void> {
    try {
      // Get product details
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, title: true, sellerId: true },
      });
      
      if (!product) return;
      
      const actualSellerId = sellerId || product.sellerId;
      
      // 1. Notify seller that product was sold
      if (actualSellerId) {
        await this.notificationService.createInAppNotification(
          actualSellerId,
          NotificationType.ORDER_CREATED,
          {
            productId: product.id,
            productTitle: product.title,
          },
        );
      }
      
      // 2. Notify users who have this product in wishlist
      const wishlistEntries = await this.prisma.wishlistItem.findMany({
        where: { productId },
        include: { wishlist: { select: { userId: true } } },
      });
      
      for (const entry of wishlistEntries) {
        const userId = entry.wishlist.userId;
        if (userId !== actualSellerId) {
          await this.notificationService.createInAppNotification(
            userId,
            NotificationType.WISHLIST_SOLD,
            {
              productId: product.id,
              productTitle: product.title,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to send product sold notifications:', error);
    }
  }

  private normalizeGuestCheckoutEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private guestCheckoutOtpKey(normEmail: string): string {
    return `guest:checkout:otp:v1:${normEmail}`;
  }

  private guestCheckoutOtpRateKey(normEmail: string): string {
    return `guest:checkout:rl:v1:${normEmail}`;
  }

  private guestCheckoutOtpPepper(): string {
    return (
      this.configService.get<string>('GUEST_CHECKOUT_OTP_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'guest-checkout-otp-dev-only'
    );
  }

  private hashGuestCheckoutOtp(normEmail: string, code: string): string {
    return createHash('sha256')
      .update(`${this.guestCheckoutOtpPepper()}:${normEmail}:${code}`, 'utf8')
      .digest('hex');
  }

  /**
   * Misafir checkout öncesi e-posta OTP gönderir (Redis + e-posta).
   * expectedCheckoutCount: sepetteki misafir sipariş satırı sayısı (her başarılı guest checkout bir hak tüketir).
   */
  async sendGuestCheckoutVerificationCode(dto: GuestSendVerificationCodeDto): Promise<{
    success: boolean;
    expiresInSeconds: number;
  }> {
    const normEmail = this.normalizeGuestCheckoutEmail(dto.email);
    const windowSec = parseInt(
      this.configService.get<string>('GUEST_CHECKOUT_OTP_SEND_WINDOW_SEC', '900'),
      10,
    );
    const maxSends = parseInt(
      this.configService.get<string>('GUEST_CHECKOUT_OTP_MAX_SEND_PER_WINDOW', '3'),
      10,
    );
    const ttlSec = parseInt(
      this.configService.get<string>('GUEST_CHECKOUT_OTP_TTL_SEC', '600'),
      10,
    );
    const maxVerifyAttempts = parseInt(
      this.configService.get<string>('GUEST_CHECKOUT_OTP_MAX_VERIFY_ATTEMPTS', '5'),
      10,
    );

    const now = Date.now();
    const rlKey = this.guestCheckoutOtpRateKey(normEmail);
    const prevSends = (await this.cache.get<number[]>(rlKey)) || [];
    const windowMs = Math.max(60, windowSec) * 1000;
    const recentSends = prevSends.filter((t) => now - t < windowMs);
    if (recentSends.length >= maxSends) {
      throw new BadRequestException(
        'Çok fazla kod isteği gönderildi. Lütfen bir süre sonra tekrar deneyin.',
      );
    }
    recentSends.push(now);
    await this.cache.set(rlKey, recentSends, { ttl: windowSec });

    const consumptions = Math.min(
      20,
      Math.max(1, dto.expectedCheckoutCount ?? 1),
    );
    const codeNum = randomInt(0, 1_000_000);
    const code = String(codeNum).padStart(6, '0');
    const h = this.hashGuestCheckoutOtp(normEmail, code);

    const sendResult = await this.notificationService.sendGuestCheckoutVerificationCode(
      normEmail,
      code,
      ttlSec,
    );
    if (!sendResult.success) {
      throw new BadRequestException(
        sendResult.error || 'Doğrulama kodu e-postası gönderilemedi',
      );
    }

    const otpKey = this.guestCheckoutOtpKey(normEmail);
    await this.cache.set(
      otpKey,
      { h, a: 0, c: consumptions, v: maxVerifyAttempts },
      { ttl: ttlSec },
    );

    return { success: true, expiresInSeconds: ttlSec };
  }

  private async consumeGuestCheckoutOtp(normEmail: string, code: string): Promise<void> {
    const otpKey = this.guestCheckoutOtpKey(normEmail);
    const record = await this.cache.get<{
      h: string;
      a: number;
      c: number;
      v?: number;
    }>(otpKey);

    if (!record?.h) {
      throw new BadRequestException('Doğrulama kodu geçersiz veya süresi dolmuş');
    }

    const maxWrong = record.v ?? 5;
    if (record.a >= maxWrong) {
      await this.cache.del(otpKey);
      throw new BadRequestException('Çok fazla hatalı deneme. Yeni kod isteyin.');
    }

    const expectedHex = this.hashGuestCheckoutOtp(normEmail, code.trim());
    const aBuf = Buffer.from(record.h, 'hex');
    const bBuf = Buffer.from(expectedHex, 'hex');
    const match =
      aBuf.length === bBuf.length &&
      aBuf.length > 0 &&
      timingSafeEqual(aBuf, bBuf);

    const ttlLeft = await this.cache.ttl(otpKey);

    if (!match) {
      record.a += 1;
      if (record.a >= maxWrong) {
        await this.cache.del(otpKey);
      } else if (ttlLeft > 0) {
        await this.cache.set(otpKey, record, { ttl: ttlLeft });
      }
      throw new BadRequestException('Doğrulama kodu hatalı');
    }

    record.c -= 1;
    if (record.c <= 0) {
      await this.cache.del(otpKey);
    } else if (ttlLeft > 0) {
      await this.cache.set(otpKey, { h: record.h, a: 0, c: record.c, v: maxWrong }, { ttl: ttlLeft });
    } else {
      await this.cache.del(otpKey);
    }
  }

  /**
   * Guest checkout - Create order without registration
   * Requirement: Guest checkout (requirements.txt)
   */
  async guestCheckout(dto: GuestCheckoutDto) {
    const normEmail = this.normalizeGuestCheckoutEmail(dto.email);
    await this.consumeGuestCheckoutOtp(normEmail, dto.emailVerificationCode);

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM products p
        WHERE p.id = ${dto.productId}
        FOR UPDATE
      `;
      if (!lockedRows?.length) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        include: {
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
          seller: { select: { id: true, email: true, displayName: true } },
        },
      });

      if (!product) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      if (product.status !== ProductStatus.active) {
        throw new BadRequestException('Bu ürün satışta değil');
      }

      // Adet bazlı stok: müsait adet >= 1
      const available = getAvailableQuantity(product);
      if (available !== null && available < 1) {
        throw new BadRequestException('Bu ürün stokta bulunmamaktadır');
      }

      // Get price (from offer or direct buy price)
      let finalPrice = dto.price || Number(product.price);
      
      if (dto.offerId) {
        const offer = await tx.offer.findUnique({
          where: { id: dto.offerId },
        });

        if (!offer || offer.productId !== dto.productId) {
          throw new BadRequestException('Geçersiz teklif');
        }

        if (offer.status !== OfferStatus.accepted) {
          throw new BadRequestException('Teklif kabul edilmemiş');
        }

        finalPrice = Number(offer.amount);
      }

      // Get or create a system guest user for all guest orders
      // This avoids unique constraint issues - actual guest info stored in shippingAddress
      const SYSTEM_GUEST_EMAIL = 'guest@tarodan.system';
      let systemGuestUser = await tx.user.findUnique({
        where: { email: SYSTEM_GUEST_EMAIL },
      });

      if (!systemGuestUser) {
        systemGuestUser = await tx.user.create({
          data: {
            email: SYSTEM_GUEST_EMAIL,
            displayName: 'GUEST_SYSTEM',
            passwordHash: '',
            isVerified: false,
            isSeller: false,
          },
        });
      }

      const guestUser = systemGuestUser;

      // Validate shipping address for guest checkout
      if (!dto.shippingAddress?.fullName?.trim()) {
        throw new BadRequestException('Teslimat adresi için ad soyad gereklidir');
      }
      if (!dto.shippingAddress?.phone?.trim()) {
        throw new BadRequestException('Teslimat adresi için telefon numarası gereklidir');
      }
      if (!dto.shippingAddress?.city?.trim()) {
        throw new BadRequestException('Teslimat adresi için şehir gereklidir');
      }
      if (!dto.shippingAddress?.district?.trim()) {
        throw new BadRequestException('Teslimat adresi için ilçe gereklidir');
      }
      if (!dto.shippingAddress?.address?.trim()) {
        throw new BadRequestException('Teslimat adresi için açık adres gereklidir');
      }

      // Calculate commission with category-based matching (3.3)
      // Commission is calculated on product price, not including shipping
      const commissionResult = await this.calculateCommission(
        finalPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Calculate shipping cost (free shipping for orders >= 500 TL)
      const shippingCost = await this.calculateShippingCost(finalPrice);
      // Buyer fee is added to order total
      const totalAmount = finalPrice + shippingCost + commissionResult.buyerFeeAmount;

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      const guestSuratKey =
        dto.idempotencyKey?.trim() ||
        this.buildSuratIdempotencyKey([
          dto.email?.trim() || '',
          dto.productId,
          dto.offerId || '',
          `${dto.shippingAddress.city}|${dto.shippingAddress.phone}|${dto.shippingAddress.address}`,
        ]);

      await this.assertSuratShipmentSucceeded({
        correlationId: randomUUID(),
        idempotencyKey: guestSuratKey,
        recipientFullName: dto.shippingAddress.fullName.trim(),
        recipientPhone: dto.shippingAddress.phone.trim(),
        recipientCity: dto.shippingAddress.city.trim(),
        recipientDistrict: dto.shippingAddress.district.trim(),
        recipientAddressLine: dto.shippingAddress.address.trim(),
        productId: dto.productId,
        productTitle: product.title ?? undefined,
        orderNumberPreview: orderNumber,
      });

      // Build guest shippingAddress JSON; add billing when provided and different
      const guestShippingJson: Record<string, unknown> = {
        guestName: dto.guestName?.trim() || dto.shippingAddress.fullName.trim(),
        guestEmail: normEmail,
        guestPhone: dto.phone?.trim(),
        fullName: dto.shippingAddress.fullName.trim(),
        phone: dto.shippingAddress.phone.trim(),
        city: dto.shippingAddress.city.trim(),
        district: dto.shippingAddress.district.trim(),
        address: dto.shippingAddress.address.trim(),
        zipCode: dto.shippingAddress.zipCode?.trim() || null,
        isGuestOrder: true,
      };
      if (this.suratCargoService.isIntegrationEnabled()) {
        guestShippingJson.suratIdempotencyKey = guestSuratKey;
      }
      if (dto.billingAddress?.fullName?.trim() && dto.billingAddress?.city?.trim() && dto.billingAddress?.address?.trim()) {
        (guestShippingJson as any).billingAddress = {
          fullName: dto.billingAddress.fullName.trim(),
          phone: dto.billingAddress.phone?.trim() || dto.shippingAddress.phone.trim(),
          city: dto.billingAddress.city.trim(),
          district: dto.billingAddress.district?.trim() || '',
          address: dto.billingAddress.address.trim(),
          zipCode: dto.billingAddress.zipCode?.trim() || null,
        };
      }

      // Tek siparişlik grup (misafir yolu)
      const guestOrderGroup = await tx.checkoutGroup.create({
        data: {
          groupNumber: `GRP${orderNumber}`,
          buyerId: guestUser.id,
          totalAmount,
          isGuest: true,
        },
      });

      // Create order - store all guest info in shippingAddress JSON
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: dto.productId,
          buyerId: guestUser.id,
          sellerId: product.sellerId,
          offerId: dto.offerId,
          checkoutGroupId: guestOrderGroup.id,
          totalAmount,
          shippingCost,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddress: guestShippingJson as Prisma.InputJsonValue,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
          },
        },
      });

      // Record commission snapshot for analytics (3.3)
      await this.recordCommissionSnapshot(
        order.id,
        orderNumber,
        commissionResult.commissionAmount,
        finalPrice,
        commissionResult,
      );

      // Adet bazlı rezervasyon: 1 adet rezerve et (invalidation yok — cron halledecek)
      await tx.product.update({
        where: { id: dto.productId },
        data: { reservedQuantity: { increment: 1 } },
      });

      return {
        ...(await this.formatOrderResponse(order, guestUser.id)),
        guestEmail: dto.email,
        orderNumber: order.orderNumber,
        productId: dto.productId,
      };
    });

    // Invalidate product cache after successful transaction
    await this.invalidateProductCaches(dto.productId);

    return result;
  }

  /**
   * Track guest order by order number and email
   * Requirement: Guest checkout (requirements.txt)
   */
  async trackGuestOrder(dto: GuestOrderTrackDto) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: dto.orderNumber },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        buyer: {
          select: { id: true, displayName: true, email: true, isVerified: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        shipment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Verify email matches - check guest email in shippingAddress or buyer email
    const shippingData = order.shippingAddress as any;
    const guestEmail = shippingData?.guestEmail?.toLowerCase();
    const buyerEmail = order.buyer.email?.toLowerCase();
    const inputEmail = dto.email.toLowerCase();
    
    if (guestEmail !== inputEmail && buyerEmail !== inputEmail) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      product: {
        id: order.product.id,
        title: order.product.title,
        image: this.resolveProductImageUrl(order.product.images?.[0]?.cardKey),
      },
      seller: order.seller,
      shippingAddress: order.shippingAddress,
      shipment: order.shipment ? {
        provider: order.shipment.provider,
        trackingNumber: order.shipment.trackingNumber,
        trackingUrl: order.shipment.trackingUrl,
        status: order.shipment.status,
        estimatedDelivery: order.shipment.estimatedDelivery,
      } : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Satıcı kazanç özeti — aktif filtreden ve sayfalamadan BAĞIMSIZ sunucu toplamı.
   * Mobil "Kazanç Özeti" kartı bunu kullanır (önceden 20'lik sayfa + statü filtresinden
   * türetiliyordu → filtreye basınca rakam değişiyordu).
   *   totalEarnings   = teslim edilen + tamamlanan siparişlerin toplam tutarı
   *   pendingEarnings = ödendi + hazırlanıyor + kargoda siparişlerin toplam tutarı
   */
  async getSellerEarnings(sellerId: string): Promise<{ totalEarnings: number; pendingEarnings: number }> {
    const [realized, pending] = await Promise.all([
      this.prisma.order.aggregate({
        where: { sellerId, status: { in: [OrderStatus.delivered, OrderStatus.completed] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { sellerId, status: { in: [OrderStatus.paid, OrderStatus.preparing, OrderStatus.shipped] } },
        _sum: { totalAmount: true },
      }),
    ]);
    return {
      totalEarnings: Number(realized._sum.totalAmount ?? 0),
      pendingEarnings: Number(pending._sum.totalAmount ?? 0),
    };
  }

  /**
   * Get orders for current user
   */
  async findUserOrders(userId: string, query: OrderQueryDto) {
    const { status, role, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {};

    // Filter by role
    if (role === 'buyer') {
      where.buyerId = userId;
    } else if (role === 'seller') {
      where.sellerId = userId;
    } else {
      // Default: both
      where.OR = [{ buyerId: userId }, { sellerId: userId }];
    }

    // Varsayılan listede iptal edilen (ödeme başarısız vb.) siparişleri gösterme
    if (status) {
      where.status = status;
    } else {
      where.status = { not: OrderStatus.cancelled };
    }

    // Üyelik ve boost (öne çıkarma) sanal siparişlerini "siparişlerim" listesinde gösterme
    // (sadece gerçek ürün siparişleri). Boost'lar "Boostlarım"da görünür.
    where.NOT = {
      OR: [
        { productId: { startsWith: 'membership-' } },
        { productId: { startsWith: 'boost-' } },
      ],
    };

    const total = await this.prisma.order.count({ where });

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        buyer: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        shipment: true,
      },
    });

    return {
      data: await Promise.all(orders.map((o) => this.formatOrderResponse(o, userId))),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single order by ID
   */
  async findOne(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        buyer: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        shipment: {
          include: {
            events: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
        payment: true,
        refundRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Only buyer or seller can view the order
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Bu siparişi görüntüleme yetkiniz yok');
    }

    return await this.formatOrderResponse(order, userId);
  }

  /** Grup statüsü türetme: tüm siparişler aynıysa o statü, değilse 'mixed' */
  private deriveGroupStatus(orders: Array<{ status: OrderStatus }>): string {
    const active = orders.filter((o) => o.status !== OrderStatus.cancelled);
    const pool = active.length > 0 ? active : orders;
    const first = pool[0]?.status;
    return pool.every((o) => o.status === first) ? String(first) : 'mixed';
  }

  /**
   * Alıcının sipariş grupları (sayfalı). Her grup tek "sipariş" kartı gibi
   * gösterilir; içindeki siparişler ürün satırlarıdır (her birinin kendi kargosu).
   * GET /orders/groups
   */
  async findUserCheckoutGroups(userId: string, page = 1, limit = 20) {
    const where: Prisma.CheckoutGroupWhereInput = {
      buyerId: userId,
      // Tüm siparişleri iptal olan grupları varsayılan listede gösterme
      orders: { some: { status: { not: OrderStatus.cancelled } } },
    };

    const total = await this.prisma.checkoutGroup.count({ where });
    const groups = await this.prisma.checkoutGroup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        orders: {
          include: {
            product: {
              include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
            },
            buyer: {
              select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
            },
            seller: {
              select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
            },
            shipment: true,
          },
        },
      },
    });

    const data = await Promise.all(
      groups.map(async (group) => {
        const visibleOrders = group.orders.filter((o) => o.status !== OrderStatus.cancelled);
        const orders = visibleOrders.length > 0 ? visibleOrders : group.orders;
        return {
          id: group.id,
          groupNumber: group.groupNumber,
          totalAmount: Number(group.totalAmount),
          status: this.deriveGroupStatus(group.orders),
          createdAt: group.createdAt,
          orders: await Promise.all(orders.map((o) => this.formatOrderResponse(o, userId))),
        };
      }),
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Tek sipariş grubu detayı: grup başlığı + tam formatlı siparişler
   * (her ürün satırında kendi kargo takibi/eventleri).
   * GET /orders/groups/:id
   */
  async findCheckoutGroup(groupId: string, userId: string) {
    const group = await this.prisma.checkoutGroup.findUnique({
      where: { id: groupId },
      include: {
        orders: {
          include: {
            product: {
              include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
            },
            buyer: {
              select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
            },
            seller: {
              select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
            },
            shipment: {
              include: {
                events: { orderBy: { createdAt: 'desc' }, take: 5 },
              },
            },
            payment: true,
            refundRequests: { orderBy: { createdAt: 'desc' } },
          },
        },
        payment: {
          select: { id: true, status: true, amount: true, provider: true, paidAt: true },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Sipariş grubu bulunamadı');
    }
    if (group.buyerId !== userId) {
      throw new ForbiddenException('Bu sipariş grubunu görüntüleme yetkiniz yok');
    }

    return {
      id: group.id,
      groupNumber: group.groupNumber,
      totalAmount: Number(group.totalAmount),
      status: this.deriveGroupStatus(group.orders),
      createdAt: group.createdAt,
      payment: group.payment
        ? {
            id: group.payment.id,
            status: group.payment.status,
            amount: Number(group.payment.amount),
            provider: group.payment.provider,
            paidAt: group.payment.paidAt,
          }
        : null,
      orders: await Promise.all(
        group.orders.map((o) => this.formatOrderResponse(o, userId)),
      ),
    };
  }

  /**
   * Set shipping address on an existing order (buyer only, pending_payment).
   * Used when completing payment for offer-accepted orders that had no address at creation.
   */
  async setShippingAddress(
    orderId: string,
    userId: string,
    dto: { fullName: string; phone: string; city: string; district: string; address: string; zipCode?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: { include: { images: { take: 1 } } }, buyer: true, seller: true, shipment: true, payment: true },
    });
    if (!order) throw new NotFoundException('Sipariş bulunamadı');
    if (order.buyerId !== userId) throw new ForbiddenException('Bu siparişe adres ekleme yetkiniz yok');
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Sadece ödeme bekleyen siparişlere adres eklenebilir');
    }
    const shippingAddress = {
      fullName: dto.fullName.trim(),
      phone: dto.phone.trim(),
      city: dto.city.trim(),
      district: dto.district.trim(),
      address: dto.address.trim(),
      zipCode: dto.zipCode?.trim() || null,
    };
    await this.prisma.order.update({
      where: { id: orderId },
      data: { shippingAddress: shippingAddress as any },
    });
    return this.formatOrderResponse({ ...order, shippingAddress }, userId);
  }

  /**
   * Update order status (seller only for certain transitions)
   * Business Rules:
   * - pending_payment → paid (handled by payment module)
   * - paid → preparing (seller)
   * - preparing → shipped (handled by shipping module)
   * - shipped → delivered (handled by shipping module)
   * - delivered → completed (buyer confirms)
   */
  async updateStatus(orderId: string, userId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Validate state transitions
    const allowedTransitions: Record<OrderStatus, { nextStatuses: OrderStatus[]; allowedBy: 'buyer' | 'seller' | 'system' }[]> = {
      [OrderStatus.pending_payment]: [
        { nextStatuses: [OrderStatus.paid], allowedBy: 'system' },
        { nextStatuses: [OrderStatus.preparing], allowedBy: 'system' }, // Payment success → preparing (first state after purchase)
        { nextStatuses: [OrderStatus.cancelled], allowedBy: 'buyer' },
      ],
      [OrderStatus.paid]: [
        { nextStatuses: [OrderStatus.preparing], allowedBy: 'seller' },
        { nextStatuses: [OrderStatus.cancelled, OrderStatus.refunded], allowedBy: 'system' },
      ],
      [OrderStatus.preparing]: [
        { nextStatuses: [OrderStatus.shipped], allowedBy: 'system' }, // Triggered by shipping
      ],
      [OrderStatus.shipped]: [
        { nextStatuses: [OrderStatus.delivered], allowedBy: 'system' }, // Triggered by shipping update
      ],
      [OrderStatus.delivered]: [
        { nextStatuses: [OrderStatus.completed], allowedBy: 'buyer' },
      ],
      [OrderStatus.awaiting_buyer_confirmation]: [
        { nextStatuses: [OrderStatus.completed], allowedBy: 'buyer' },   // manual_ok (confirmReceipt)
        { nextStatuses: [OrderStatus.completed], allowedBy: 'system' },  // auto_timeout (cron)
        { nextStatuses: [OrderStatus.refund_requested], allowedBy: 'buyer' },
      ],
      [OrderStatus.completed]: [],
      [OrderStatus.cancelled]: [],
      [OrderStatus.refund_requested]: [
        { nextStatuses: [OrderStatus.refunded], allowedBy: 'system' },
      ],
      [OrderStatus.refunded]: [],
    };

    const currentTransitions = allowedTransitions[order.status] || [];
    const transition = currentTransitions.find((t) => t.nextStatuses.includes(dto.status));

    if (!transition) {
      throw new BadRequestException(
        `Sipariş durumu ${order.status}'den ${dto.status}'e değiştirilemez`,
      );
    }

    // Check permission
    if (transition.allowedBy === 'buyer' && order.buyerId !== userId) {
      throw new ForbiddenException('Bu durum değişikliğini yapmaya yetkiniz yok');
    }
    if (transition.allowedBy === 'seller' && order.sellerId !== userId) {
      throw new ForbiddenException('Bu durum değişikliğini yapmaya yetkiniz yok');
    }
    if (transition.allowedBy === 'system') {
      throw new BadRequestException('Bu durum değişikliği sistem tarafından yapılır');
    }

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: orderId,
        version: order.version, // Optimistic locking
      },
      data: {
        status: dto.status,
        version: { increment: 1 },
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        buyer: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        shipment: true,
      },
    });

    return await this.formatOrderResponse(updatedOrder, userId);
  }

  /**
   * 48h pencere ortak tamamlama. Spec Bölüm 6.4.
   * Atomik: status guard + ledger.markEarned + PaymentHold release.
   */
  async completeOrder(
    orderId: string,
    type: 'manual_ok' | 'auto_timeout' | 'admin_force',
  ): Promise<{ completed: boolean }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.awaiting_buyer_confirmation },
        data: {
          status: OrderStatus.completed,
          completedAt: now,
          buyerConfirmedAt: now,
          buyerConfirmationType: type as any,
        },
      });

      if (updated.count === 0) {
        this.logger.warn(
          `completeOrder noop: order ${orderId} not in awaiting_buyer_confirmation`,
        );
        return { completed: false };
      }

      const ledgerResult = await this.commissionLedger.markEarned(orderId, tx);
      if (!ledgerResult.updated) {
        this.logger.warn(
          `completeOrder: ledger not in pending for order ${orderId}`,
        );
      }

      const holdUpdate = await tx.paymentHold.updateMany({
        where: { orderId, status: 'held' as any },
        data: {
          status: 'released' as any,
          releasedAt: now,
          releaseAt: now,
        },
      });

      this.logger.log(
        `Order ${orderId} completed (type=${type}); ledger=${ledgerResult.updated}, hold=${holdUpdate.count}`,
      );
      return { completed: true };
    });

    // Tx commit sonrası bildirimler (non-blocking). Faz 3B.3.
    if (result.completed) {
      try {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { buyerId: true, sellerId: true },
        });
        if (order) {
          if (type === 'manual_ok') {
            await this.notificationService
              .notifyOrderManuallyConfirmed(order.sellerId, orderId)
              .catch((e) =>
                this.logger.warn(`notify manual_ok failed: ${e.message}`),
              );
          } else if (type === 'auto_timeout') {
            await Promise.allSettled([
              this.notificationService.notifyOrderAutoCompleted(
                order.buyerId,
                orderId,
              ),
              this.notificationService.notifyOrderAutoCompleted(
                order.sellerId,
                orderId,
              ),
            ]);
          } else if (type === 'admin_force') {
            await Promise.allSettled([
              this.notificationService.notifyOrderForceCompletedByAdmin(
                order.buyerId,
                orderId,
              ),
              this.notificationService.notifyOrderForceCompletedByAdmin(
                order.sellerId,
                orderId,
              ),
            ]);
          }
        }
      } catch (e: any) {
        this.logger.warn(
          `completeOrder post-commit notify error for ${orderId}: ${e?.message}`,
        );
      }
    }

    return result;
  }

  /**
   * Alıcının "Sorun yok" erken onay endpoint'i. Spec Bölüm 6.2.
   */
  async confirmReceipt(
    orderId: string,
    userId: string,
  ): Promise<{ completed: boolean }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, buyerId: true, status: true },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Bu siparişi onaylama yetkiniz yok');
    }
    if (order.status !== OrderStatus.awaiting_buyer_confirmation) {
      throw new BadRequestException(
        `Sipariş bu aşamada onaylanamaz (mevcut durum: ${order.status})`,
      );
    }

    const openRefund = await this.prisma.refundRequest.findFirst({
      where: {
        orderId,
        status: {
          in: [
            'pending_review',
            'approved',
            'wait_for_delivery',
            'return_shipment_open',
            'return_in_transit',
            'return_delivered',
            'disputed',
          ] as any,
        },
      },
      select: { id: true },
    });
    if (openRefund) {
      throw new BadRequestException(
        'Açık bir iade talebi var; önce sonuçlanması gerek',
      );
    }

    return this.completeOrder(orderId, 'manual_ok');
  }

  /**
   * Admin force-complete: awaiting_buyer_confirmation → completed.
   * Spec Bölüm 9.1. Audit log için reason parametresi.
   */
  async forceComplete(
    orderId: string,
    adminId: string,
    reason?: string,
  ): Promise<{ completed: boolean }> {
    this.logger.log(
      `Admin ${adminId} force-completing order ${orderId}. reason="${reason ?? ''}"`,
    );
    return this.completeOrder(orderId, 'admin_force');
  }

  /**
   * Admin 48h penceresini uzatır.
   * Spec Bölüm 9.1.
   */
  async extendConfirmation(
    orderId: string,
    adminId: string,
    hours: number,
    reason?: string,
  ): Promise<{ newDeadline: Date }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, confirmationDeadline: true },
    });
    if (!order) throw new NotFoundException('Sipariş bulunamadı');
    if (order.status !== OrderStatus.awaiting_buyer_confirmation) {
      throw new BadRequestException(
        'Sadece 48h penceresindeki siparişlerde uzatılabilir',
      );
    }

    const base = order.confirmationDeadline ?? new Date();
    const newDeadline = new Date(base.getTime() + hours * 3_600_000);
    await this.prisma.order.update({
      where: { id: orderId },
      data: { confirmationDeadline: newDeadline },
    });

    this.logger.log(
      `Admin ${adminId} extended confirmationDeadline of ${orderId} by ${hours}h → ${newDeadline.toISOString()} reason="${reason ?? ''}"`,
    );
    return { newDeadline };
  }

  /**
   * Cancel order
   * Business Rules:
   * - Only buyer can cancel
   * - Can only cancel before shipping
   * - If paid, triggers refund process
   */
  async cancel(orderId: string, userId: string, dto: CancelOrderDto) {
    let productIdToInvalidate: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { product: true },
      });

      if (!order) {
        throw new NotFoundException('Sipariş bulunamadı');
      }
      productIdToInvalidate = order.productId;

      // Only buyer can cancel
      if (order.buyerId !== userId) {
        throw new ForbiddenException('Bu siparişi iptal etme yetkiniz yok');
      }

      // Can only cancel before shipping
      const cancellableStatuses: OrderStatus[] = [
        OrderStatus.pending_payment,
        OrderStatus.paid,
        OrderStatus.preparing,
      ];

      if (!cancellableStatuses.includes(order.status)) {
        throw new BadRequestException(
          'Sipariş kargoya verildikten sonra iptal edilemez',
        );
      }

      // Determine new status based on payment
      const newStatus = order.status === OrderStatus.pending_payment
        ? OrderStatus.cancelled
        : OrderStatus.refunded; // Will trigger refund in payment module

      // Update order
      const cancelledOrder = await tx.order.update({
        where: {
          id: orderId,
          version: order.version,
        },
        data: {
          status: newStatus,
          version: { increment: 1 },
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
          },
        },
      });

      // Rezervasyonu kaldır (pending_payment ise 1 adet serbest bırak)
      if (order.status === OrderStatus.pending_payment) {
        await tx.product.update({
          where: { id: order.productId },
          data: { reservedQuantity: { decrement: 1 } },
        });
      }

      // Re-enable the offer (or mark as cancelled)
      if (order.offerId) {
        await tx.offer.update({
          where: { id: order.offerId },
          data: { status: OfferStatus.cancelled },
        });
      }

      // Ledger: paid/preparing'den iptalse pending → waived (Faz 3B.5).
      // pending_payment'da ledger henüz yaratılmamıştır (PaymentService.processSuccessfulPayment'da
      // upsert ediliyor); markWaived noop döner. Spec Bölüm 7.4 (buyer-initiated)
      // ile uyumlu — komisyon alınmaz çünkü iş tamamlanmadı.
      await this.commissionLedger.markWaived(orderId, 'buyer_cancelled', tx);

      // Note: Refund will be handled by PaymentModule when status is 'refunded'

      return await this.formatOrderResponse(cancelledOrder, userId);
    });
    if (productIdToInvalidate) {
      await this.invalidateProductCaches(productIdToInvalidate);
    }
    return result;
  }

  /**
   * Reactivate a cancelled order that came from an accepted offer.
   * Allowed when: order is cancelled, has offerId, offer still accepted, product still available, user is buyer.
   * Used when the order was auto-cancelled by payment timeout; buyer can reopen to complete payment.
   */
  async reactivate(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true, offer: true },
    });
    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Bu siparişi yeniden aktive etme yetkiniz yok');
    }
    if (order.status !== OrderStatus.cancelled) {
      throw new BadRequestException('Sadece iptal edilmiş siparişler yeniden aktive edilebilir');
    }
    if (!order.offerId || !order.offer) {
      throw new BadRequestException('Bu sipariş tekliften oluşmadığı için yeniden aktive edilemez');
    }
    if (order.offer.status !== OfferStatus.accepted) {
      throw new BadRequestException('İlgili teklif artık kabul edilmiş değil');
    }
    const available = getAvailableQuantity(order.product);
    if (available !== null && available < 1) {
      throw new BadRequestException('Ürün için yeterli müsait adet yok');
    }

    await this.prisma.$transaction(async (tx) => {
      // Yeniden rezerve et (FOR UPDATE ile)
      await this.productLockService.checkAndReserve(tx, order.productId, 1);
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.pending_payment, version: { increment: 1 } },
      });
    });

    return this.findOne(orderId, userId);
  }

  /**
   * Mark order as preparing (seller only)
   */
  async markAsPreparing(orderId: string, sellerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Bu siparişi güncelleme yetkiniz yok');
    }

    if (order.status !== OrderStatus.paid) {
      throw new BadRequestException('Sadece ödenmiş siparişler hazırlanabilir');
    }

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: orderId,
        version: order.version,
      },
      data: {
        status: OrderStatus.preparing,
        version: { increment: 1 },
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        buyer: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        shipment: true,
      },
    });

    return await this.formatOrderResponse(updatedOrder, sellerId);
  }

  /**
   * Confirm delivery (buyer only)
   */
  async confirmDelivery(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Bu siparişi onaylama yetkiniz yok');
    }

    if (order.status !== OrderStatus.delivered) {
      throw new BadRequestException('Sadece teslim edilmiş siparişler onaylanabilir');
    }

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: orderId,
        version: order.version,
      },
      data: {
        status: OrderStatus.completed,
        version: { increment: 1 },
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        buyer: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true, avatarUrl: true },
        },
        shipment: true,
      },
    });

    // Update product status based on remaining quantity (no stock decrement - already done at payment)
    if (order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });

      if (product) {
        const newStatus = getProductStatusFromQuantity(product.quantity);
        await this.prisma.product.update({
          where: { id: order.productId },
          data: { status: newStatus },
        });

        // Invalidate cache
        await this.cache.del(`products:detail:${order.productId}`);
        await this.cache.delPattern('products:list:*');
      }
    }

    // Note: This will trigger seller payout release in PaymentModule

    return await this.formatOrderResponse(updatedOrder, buyerId);
  }

  /**
   * Resolve product image URL (S3 key -> presigned URL)
   */
  private async resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl('avatars', avatarUrl, 86400);
      } catch {
        return null;
      }
    }
    return null;
  }

  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    if (imageKeyOrUrl.includes('dev/') || imageKeyOrUrl.includes('prod/')) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  /**
   * Get hasProductRating and hasSellerRating for buyer (used in formatOrderResponse)
   */
  private async getOrderRatingFlags(order: any, userId: string): Promise<{ hasProductRating?: boolean; hasSellerRating?: boolean }> {
    const isBuyer = order.buyerId === userId;
    if (!isBuyer || !order.productId || !order.sellerId) {
      return {};
    }
    const [productRating, userRating] = await Promise.all([
      this.prisma.productRating.findFirst({ where: { orderId: order.id, userId } }),
      this.prisma.rating.findFirst({ where: { orderId: order.id, giverId: userId, receiverId: order.sellerId } }),
    ]);
    return {
      hasProductRating: !!productRating,
      hasSellerRating: !!userRating,
    };
  }

  /**
   * Format order response
   */
  private async formatOrderResponse(order: any, userId: string) {
    const resolvedImageUrl = this.resolveProductImageUrl(order.product?.images?.[0]?.cardKey);
    const product = order.product ? {
      id: order.product.id,
      title: order.product.title,
      imageUrl: resolvedImageUrl,
      status: order.product.status,
      price: order.product.price != null ? Number(order.product.price) : undefined,
      condition: order.product.condition,
    } : null;

    // Tracking URL: Sürat gönderilerinde takip numarasından türetilir
    const trackingNumber = order.shipment?.trackingNumber ?? null;
    const trackingUrl =
      trackingNumber && order.shipment?.provider === 'surat'
        ? `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(trackingNumber)}`
        : null;

    const totalAmount = Number(order.totalAmount ?? 0);
    const shippingCost = Number(order.shippingCost ?? 0);
    const buyerFeeAmount = Number(order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(order.commissionAmount ?? 0);
    const subtotal = totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = Math.max(0, subtotal - sellerFeeAmount);

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };
    
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      checkoutGroupId: order.checkoutGroupId ?? null,
      amount: totalAmount,
      totalAmount,
      commissionAmount,
      buyerFeeAmount,
      sellerFeeAmount,
      shippingCost,
      pricing,
      status: order.status,
      product,
      // Frontend items array bekliyor - tek ürünü items formatında da döndür
      items: product ? [{
        id: order.id,
        product,
        quantity: 1,
        price: Number(order.totalAmount),
      }] : [],
      buyer: {
        ...order.buyer,
        avatarUrl: await this.resolveAvatarUrl(order.buyer?.avatarUrl),
      },
      seller: {
        ...order.seller,
        avatarUrl: await this.resolveAvatarUrl(order.seller?.avatarUrl),
      },
      shippingAddress: order.shippingAddress && typeof order.shippingAddress === 'object'
        ? {
            id: (order.shippingAddress as any).id || order.shippingAddressId || '',
            title: (order.shippingAddress as any).title || '',
            fullName: (order.shippingAddress as any).fullName || '',
            phone: (order.shippingAddress as any).phone || '',
            address: (order.shippingAddress as any).address || (order.shippingAddress as any).addressLine1 || '',
            addressLine1: (order.shippingAddress as any).address || (order.shippingAddress as any).addressLine1 || '',
            addressLine2: (order.shippingAddress as any).addressLine2 || '',
            district: (order.shippingAddress as any).district || '',
            city: (order.shippingAddress as any).city || '',
            zipCode: (order.shippingAddress as any).zipCode || (order.shippingAddress as any).postalCode || '',
            postalCode: (order.shippingAddress as any).zipCode || (order.shippingAddress as any).postalCode || '',
          }
        : null,
      billingAddress: null, // Billing address not stored separately
      shipment: order.shipment
        ? {
            id: order.shipment.id,
            provider: order.shipment.provider,
            trackingNumber: order.shipment.trackingNumber,
            trackingUrl,
            status: order.shipment.status,
            cost: order.shipment.cost ? Number(order.shipment.cost) : null,
            shippedAt: order.shipment.shippedAt ?? null,
            deliveredAt: order.shipment.deliveredAt ?? null,
          }
        : null,
      // Mobil sipariş detayı bu alanları üst seviyede okur (kargo kartı + zaman çizelgesi)
      trackingNumber,
      trackingUrl,
      paidAt: order.payment?.paidAt ?? null,
      shippedAt: order.shipment?.shippedAt ?? null,
      deliveredAt: order.deliveredAt ?? order.shipment?.deliveredAt ?? null,
      completedAt: order.completedAt ?? null,
      confirmationDeadline: order.confirmationDeadline ?? null,
      buyerConfirmedAt: order.buyerConfirmedAt ?? null,
      isBuyer: order.buyerId === userId,
      isSeller: order.sellerId === userId,
      ...(await this.getOrderRatingFlags(order, userId)),
      offerId: order.offerId ?? undefined,
      payment: order.payment
        ? {
            id: order.payment.id,
            status: order.payment.status,
            amount: Number(order.payment.amount),
            provider: order.payment.provider,
            failureReason: order.payment.failureReason ?? undefined,
          }
        : undefined,
      activeRefundRequest: this.pickActiveRefundRequest(order.refundRequests ?? []),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private pickActiveRefundRequest(refundRequests: any[]): any | null {
    const activeStatuses = [
      'pending_review',
      'approved',
      'wait_for_delivery',
      'return_shipment_open',
      'return_in_transit',
      'return_delivered',
      'disputed',
    ];
    const active = refundRequests.find((r) => activeStatuses.includes(r.status));
    if (!active) {
      const refunded = refundRequests.find((r) => r.status === 'refunded');
      if (refunded) {
        return {
          id: refunded.id,
          refundNumber: refunded.refundNumber,
          status: refunded.status,
          createdAt: refunded.createdAt,
          refundedAt: refunded.refundedAt,
        };
      }
      return null;
    }
    return {
      id: active.id,
      refundNumber: active.refundNumber,
      status: active.status,
      reason: active.reason,
      returnTrackingNumber: active.returnTrackingNumber,
      returnProvider: active.returnProvider,
      returnStatus: active.returnStatus,
      createdAt: active.createdAt,
    };
  }
}
