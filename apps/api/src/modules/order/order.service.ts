import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { CreateOrderDto, OrderQueryDto, UpdateOrderStatusDto, CancelOrderDto, GuestCheckoutDto, GuestOrderTrackDto, DirectBuyDto } from './dto';
import { OrderStatus, OfferStatus, ProductStatus, CommissionRuleType, SellerType, CommissionAppliesTo, CommissionSellerType, MembershipTierType, Prisma } from '@prisma/client';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';

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
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  // Shipping cost settings
  private readonly BASE_SHIPPING_COST = 29.99; // Base shipping cost in TL
  private readonly FREE_SHIPPING_THRESHOLD = 500; // Free shipping threshold in TL

  /**
   * Calculate shipping cost based on order amount
   * Free shipping for orders >= 500 TL
   */
  calculateShippingCost(orderAmount: number): number {
    if (orderAmount >= this.FREE_SHIPPING_THRESHOLD) {
      return 0;
    }
    return this.BASE_SHIPPING_COST;
  }

  /**
   * Get free shipping info for frontend display
   */
  getFreeShippingInfo(orderAmount: number): {
    isFreeShipping: boolean;
    shippingCost: number;
    threshold: number;
    amountToFreeShipping: number;
  } {
    const shippingCost = this.calculateShippingCost(orderAmount);
    return {
      isFreeShipping: shippingCost === 0,
      shippingCost,
      threshold: this.FREE_SHIPPING_THRESHOLD,
      amountToFreeShipping: Math.max(0, this.FREE_SHIPPING_THRESHOLD - orderAmount),
    };
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
   * Generate unique order number
   */
  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ORD-${year}-`;

    // Get count of orders this year for sequential numbering
    const count = await this.prisma.order.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01`),
        },
      },
    });

    return `${prefix}${String(count + 1).padStart(6, '0')}`;
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
  private async calculateCommission(
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
      seller?.membership?.tier?.type ?? null
    );

    // Fetch all active commission rules
    const rules = await this.prisma.commissionRule.findMany({
      where: { isActive: true },
      include: { category: true },
    });

    this.logger.debug(`Found ${rules.length} active commission rules`);

    // Match by specificity (deterministic order, priority within same specificity)
    const matchedRule = this.findMatchingRule(rules, categoryId, commissionSellerType);

    if (!matchedRule) {
      this.logger.warn('No matching commission rule found');
      throw new BadRequestException('No matching commission rule found. Please ensure a default rule exists.');
    }

    // Calculate fees
    const subtotal = amount;
    const rawSellerFee = matchedRule.sellerRate
      ? subtotal * (Number(matchedRule.sellerRate) / 100)
      : 0;
    const rawBuyerFee = matchedRule.buyerRate
      ? subtotal * (Number(matchedRule.buyerRate) / 100)
      : 0;

    // Clamp per side independently
    let sellerFee = this.clampAmount(
      rawSellerFee,
      matchedRule.sellerMin ? Number(matchedRule.sellerMin) : null,
      matchedRule.sellerMax ? Number(matchedRule.sellerMax) : null
    );
    let buyerFee = this.clampAmount(
      rawBuyerFee,
      matchedRule.buyerMin ? Number(matchedRule.buyerMin) : null,
      matchedRule.buyerMax ? Number(matchedRule.buyerMax) : null
    );

    // Apply appliesTo
    if (matchedRule.appliesTo === CommissionAppliesTo.SELLER) {
      buyerFee = 0;
    }
    if (matchedRule.appliesTo === CommissionAppliesTo.BUYER) {
      sellerFee = 0;
    }

    const totalCommission = sellerFee + buyerFee;

    this.logger.log(
      `Commission calculated: amount=${amount}, ` +
      `sellerFee=${sellerFee}, buyerFee=${buyerFee}, ` +
      `total=${totalCommission}, rule=${matchedRule.name}`
    );

    return {
      buyerFeeAmount: buyerFee,
      sellerFeeAmount: sellerFee,
      commissionAmount: totalCommission,
      ruleId: matchedRule.id,
      ruleName: matchedRule.name,
      // Legacy fields for backward compatibility
      ruleType: matchedRule.ruleType,
      appliedRate: matchedRule.sellerRate ? Number(matchedRule.sellerRate) : (matchedRule.buyerRate ? Number(matchedRule.buyerRate) : 0),
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
      // Get product with seller info - using Prisma instead of raw SQL
      // Transaction provides isolation for concurrent purchases
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

      // Validate product is available
      if (product.status !== ProductStatus.active) {
        throw new BadRequestException('Bu ürün satışta değil veya başkası tarafından satın alınıyor');
      }

      // Check stock availability (quantity > 0 or null for unlimited)
      if (product.quantity !== null && product.quantity <= 0) {
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

      // Get product price
      const productPrice = Number(product.price);
      
      // Calculate commission with category-based matching (3.3)
      // Commission is calculated on product price, not including shipping
      const commissionResult = await this.calculateCommission(
        productPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Calculate shipping cost (free shipping for orders >= 500 TL)
      const shippingCost = this.calculateShippingCost(productPrice);
      // Buyer fee is added to order total
      const totalAmount = productPrice + shippingCost + commissionResult.buyerFeeAmount;

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Reserve product immediately (status = RESERVED) and decrease quantity
      const updateData: any = { status: ProductStatus.reserved };
      
      // Decrease quantity if it's not null (null means unlimited stock)
      if (product.quantity !== null) {
        if (product.quantity <= 0) {
          throw new BadRequestException('Bu ürün stokta bulunmamaktadır');
        }
        updateData.quantity = { decrement: 1 };
      }
      
      await tx.product.update({
        where: { id: dto.productId },
        data: updateData,
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

      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: dto.productId,
          buyerId,
          sellerId: product.sellerId,
          totalAmount,
          shippingCost,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          status: OrderStatus.pending_payment,
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
        productId: dto.productId, // Include for cache invalidation
        paymentUrl: '', // Will be set by payment service
        provider: 'iyzico', // Default provider
      };
    });

    // Invalidate product cache after successful transaction
    await this.invalidateProductCaches(result.productId);
    
    return result;
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

      // Buyer fee is added to order total
      const totalAmount = Number(offer.amount) + commissionResult.buyerFeeAmount;

      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: offer.productId,
          buyerId,
          sellerId: offer.sellerId,
          offerId: dto.offerId,
          totalAmount,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          status: OrderStatus.pending_payment,
          shippingAddressId: dto.shippingAddressId,
          shippingAddress: shippingAddress ? {
            id: shippingAddress.id,
            title: shippingAddress.title,
            fullName: shippingAddress.fullName,
            phone: shippingAddress.phone,
            city: shippingAddress.city,
            district: shippingAddress.district,
            address: shippingAddress.address,
            zipCode: shippingAddress.zipCode,
          } : undefined,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, displayName: true, isVerified: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true },
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

      // Reserve product (status = RESERVED) - will be set to SOLD after payment is completed
      await tx.product.update({
        where: { id: offer.productId },
        data: { status: ProductStatus.reserved },
      });

      // Store productId for cache invalidation
      productIdForCache = offer.productId;

      return this.formatOrderResponse(order, buyerId);
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

  /**
   * Guest checkout - Create order without registration
   * Requirement: Guest checkout (requirements.txt)
   */
  async guestCheckout(dto: GuestCheckoutDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Get product
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

      // Check stock availability (quantity > 0 or null for unlimited)
      if (product.quantity !== null && product.quantity <= 0) {
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
      const shippingCost = this.calculateShippingCost(finalPrice);
      // Buyer fee is added to order total
      const totalAmount = finalPrice + shippingCost + commissionResult.buyerFeeAmount;

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Build guest shippingAddress JSON; add billing when provided and different
      const guestShippingJson: Record<string, unknown> = {
        guestName: dto.guestName?.trim() || dto.shippingAddress.fullName.trim(),
        guestEmail: dto.email?.trim(),
        guestPhone: dto.phone?.trim(),
        fullName: dto.shippingAddress.fullName.trim(),
        phone: dto.shippingAddress.phone.trim(),
        city: dto.shippingAddress.city.trim(),
        district: dto.shippingAddress.district.trim(),
        address: dto.shippingAddress.address.trim(),
        zipCode: dto.shippingAddress.zipCode?.trim() || null,
        isGuestOrder: true,
      };
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

      // Create order - store all guest info in shippingAddress JSON
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: dto.productId,
          buyerId: guestUser.id,
          sellerId: product.sellerId,
          offerId: dto.offerId,
          totalAmount,
          shippingCost,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          status: OrderStatus.pending_payment,
          shippingAddress: guestShippingJson as Prisma.InputJsonValue,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, displayName: true, isVerified: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true },
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

      // Update product status to reserved and decrease quantity
      const updateData: any = { status: ProductStatus.reserved };
      
      // Decrease quantity if it's not null (null means unlimited stock)
      if (product.quantity !== null) {
        if (product.quantity <= 0) {
          throw new BadRequestException('Bu ürün stokta bulunmamaktadır');
        }
        updateData.quantity = { decrement: 1 };
      }
      
      await tx.product.update({
        where: { id: dto.productId },
        data: updateData,
      });

      return {
        ...this.formatOrderResponse(order, guestUser.id),
        guestEmail: dto.email,
        orderNumber: order.orderNumber,
        productId: dto.productId, // Include for cache invalidation
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
          select: { id: true, displayName: true, isVerified: true },
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
        image: order.product.images?.[0]?.url,
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

    if (status) {
      where.status = status;
    }

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
          select: { id: true, displayName: true, isVerified: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true },
        },
        shipment: true,
      },
    });

    return {
      data: orders.map((o) => this.formatOrderResponse(o, userId)),
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
          select: { id: true, displayName: true, isVerified: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true },
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
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Only buyer or seller can view the order
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Bu siparişi görüntüleme yetkiniz yok');
    }

    return this.formatOrderResponse(order, userId);
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
          select: { id: true, displayName: true, isVerified: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true },
        },
        shipment: true,
      },
    });

    return this.formatOrderResponse(updatedOrder, userId);
  }

  /**
   * Cancel order
   * Business Rules:
   * - Only buyer can cancel
   * - Can only cancel before shipping
   * - If paid, triggers refund process
   */
  async cancel(orderId: string, userId: string, dto: CancelOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { product: true },
      });

      if (!order) {
        throw new NotFoundException('Sipariş bulunamadı');
      }

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
            select: { id: true, displayName: true, isVerified: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true },
          },
        },
      });

      // Restore product to active status
      await tx.product.update({
        where: { id: order.productId },
        data: { status: ProductStatus.active },
      });

      // Re-enable the offer (or mark as cancelled)
      if (order.offerId) {
        await tx.offer.update({
          where: { id: order.offerId },
          data: { status: OfferStatus.cancelled },
        });
      }

      // Note: Refund will be handled by PaymentModule when status is 'refunded'

      return this.formatOrderResponse(cancelledOrder, userId);
    });
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
          select: { id: true, displayName: true, isVerified: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true },
        },
        shipment: true,
      },
    });

    return this.formatOrderResponse(updatedOrder, sellerId);
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
          select: { id: true, displayName: true, isVerified: true },
        },
        seller: {
          select: { id: true, displayName: true, isVerified: true },
        },
        shipment: true,
      },
    });

    // Mark product as sold when order is completed
    if (order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });

      if (product && product.status !== ProductStatus.sold) {
        // Update product status to SOLD
        // If stock is 0, set product to inactive instead
        const updateData: any = { 
          status: product.quantity !== null && product.quantity === 0 
            ? ProductStatus.inactive 
            : ProductStatus.sold 
        };

        await this.prisma.product.update({
          where: { id: order.productId },
          data: updateData,
        });

        // Invalidate cache
        await this.cache.del(`products:detail:${order.productId}`);
        await this.cache.delPattern('products:list:*');
      }
    }

    // Note: This will trigger seller payout release in PaymentModule

    return this.formatOrderResponse(updatedOrder, buyerId);
  }

  /**
   * Format order response
   */
  private formatOrderResponse(order: any, userId: string) {
    const product = order.product ? {
      id: order.product.id,
      title: order.product.title,
      imageUrl: order.product.images?.[0]?.url,
      status: order.product.status,
    } : null;
    
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.totalAmount),
      totalAmount: Number(order.totalAmount), // Frontend uyumu için
      commissionAmount: Number(order.commissionAmount),
      status: order.status,
      product,
      // Frontend items array bekliyor - tek ürünü items formatında da döndür
      items: product ? [{
        id: order.id,
        product,
        quantity: 1,
        price: Number(order.totalAmount),
      }] : [],
      buyer: order.buyer,
      seller: order.seller,
      shippingAddress: order.shippingAddress && typeof order.shippingAddress === 'object'
        ? {
            id: (order.shippingAddress as any).id || order.shippingAddressId || '',
            title: (order.shippingAddress as any).title || '',
            addressLine1: (order.shippingAddress as any).address || (order.shippingAddress as any).addressLine1 || '',
            addressLine2: (order.shippingAddress as any).addressLine2 || '',
            district: (order.shippingAddress as any).district || '',
            city: (order.shippingAddress as any).city || '',
            postalCode: (order.shippingAddress as any).zipCode || (order.shippingAddress as any).postalCode || '',
          }
        : null,
      billingAddress: null, // Billing address not stored separately
      shipment: order.shipment
        ? {
            id: order.shipment.id,
            provider: order.shipment.provider,
            trackingNumber: order.shipment.trackingNumber,
            status: order.shipment.status,
            cost: order.shipment.cost ? Number(order.shipment.cost) : null,
          }
        : null,
      isBuyer: order.buyerId === userId,
      isSeller: order.sellerId === userId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
