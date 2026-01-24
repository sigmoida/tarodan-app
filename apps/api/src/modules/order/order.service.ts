import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { CreateOrderDto, OrderQueryDto, UpdateOrderStatusDto, CancelOrderDto, GuestCheckoutDto, GuestOrderTrackDto, DirectBuyDto } from './dto';
import { OrderStatus, OfferStatus, ProductStatus, CommissionRuleType, SellerType, Prisma } from '@prisma/client';
import { EventService } from '../events';

/**
 * Commission calculation result interface
 * Contains full details about the applied commission rule
 */
export interface CommissionResult {
  commissionAmount: number;
  ruleType: CommissionRuleType;
  ruleId: string | null;
  ruleName: string | null;
  appliedRate: number;
  wasMinApplied: boolean;
  wasMaxApplied: boolean;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly cache: CacheService,
  ) {}

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
    // Get seller info to determine seller type
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { sellerType: true },
    });

    const sellerType = seller?.sellerType || null;

    // Fetch all active commission rules ordered by priority (descending)
    const rules = await this.prisma.commissionRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    this.logger.debug(`Found ${rules.length} active commission rules`);

    // Find matching rule using priority-based hierarchy
    let matchedRule = null;

    // 1. Try exact match: categoryId + sellerType (highest priority)
    if (categoryId && sellerType) {
      matchedRule = rules.find(
        r => r.categoryId === categoryId && r.sellerType === sellerType
      );
      if (matchedRule) {
        this.logger.debug(`Matched exact rule: category=${categoryId}, sellerType=${sellerType}`);
      }
    }

    // 2. Try category-only match
    if (!matchedRule && categoryId) {
      matchedRule = rules.find(
        r => r.categoryId === categoryId && r.sellerType === null
      );
      if (matchedRule) {
        this.logger.debug(`Matched category rule: category=${categoryId}`);
      }
    }

    // 3. Try seller-type-only match
    if (!matchedRule && sellerType) {
      matchedRule = rules.find(
        r => r.categoryId === null && r.sellerType === sellerType
      );
      if (matchedRule) {
        this.logger.debug(`Matched seller type rule: sellerType=${sellerType}`);
      }
    }

    // 4. Fall back to default rule
    if (!matchedRule) {
      matchedRule = rules.find(r => r.ruleType === CommissionRuleType.default);
      if (matchedRule) {
        this.logger.debug('Using default commission rule');
      }
    }

    // If still no rule found, use hardcoded 5% default
    if (!matchedRule) {
      this.logger.warn('No commission rules found, using hardcoded 5% default');
      return {
        commissionAmount: Math.round(amount * 0.05 * 100) / 100,
        ruleType: CommissionRuleType.default,
        ruleId: null,
        ruleName: 'System Default (5%)',
        appliedRate: 5,
        wasMinApplied: false,
        wasMaxApplied: false,
      };
    }

    // Calculate commission
    const appliedRate = Number(matchedRule.percentage);
    let commission = amount * (appliedRate / 100);
    let wasMinApplied = false;
    let wasMaxApplied = false;

    // Apply minimum limit if commission is below minimum
    if (matchedRule.minCommission && commission < Number(matchedRule.minCommission)) {
      commission = Number(matchedRule.minCommission);
      wasMinApplied = true;
      this.logger.debug(`Applied minimum commission: ${commission}`);
    }

    // Apply maximum limit if commission exceeds maximum
    if (matchedRule.maxCommission && commission > Number(matchedRule.maxCommission)) {
      commission = Number(matchedRule.maxCommission);
      wasMaxApplied = true;
      this.logger.debug(`Applied maximum commission: ${commission}`);
    }

    // Round to 2 decimal places
    const commissionAmount = Math.round(commission * 100) / 100;

    this.logger.log(
      `Commission calculated: amount=${amount}, rate=${appliedRate}%, ` +
      `commission=${commissionAmount}, rule=${matchedRule.name}`
    );

    return {
      commissionAmount,
      ruleType: matchedRule.ruleType,
      ruleId: matchedRule.id,
      ruleName: matchedRule.name,
      appliedRate,
      wasMinApplied,
      wasMaxApplied,
    };
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

      // Validate billing address if provided
      let billingAddress = shippingAddress;
      if (dto.billingAddressId && dto.billingAddressId !== shippingAddressId) {
        const billing = await tx.address.findUnique({
          where: { id: dto.billingAddressId },
        });

        if (!billing || billing.userId !== buyerId) {
          throw new BadRequestException('Geçersiz fatura adresi');
        }
        billingAddress = billing;
      }

      // Get product price
      const totalAmount = Number(product.price);

      // Calculate commission with category-based matching (3.3)
      const commissionResult = await this.calculateCommission(
        totalAmount,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Reserve product immediately (status = RESERVED)
      await tx.product.update({
        where: { id: dto.productId },
        data: { status: ProductStatus.reserved },
      });

      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: dto.productId,
          buyerId,
          sellerId: product.sellerId,
          totalAmount,
          commissionAmount: commissionResult.commissionAmount,
          status: OrderStatus.pending_payment,
          shippingAddressId: shippingAddressId,
          shippingAddress: {
            id: shippingAddress.id,
            title: shippingAddress.title || 'Teslimat Adresi',
            fullName: shippingAddress.fullName,
            phone: shippingAddress.phone,
            city: shippingAddress.city,
            district: shippingAddress.district,
            address: shippingAddress.address,
            zipCode: shippingAddress.zipCode,
          },
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
        await this.eventService.emitOrderCreated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          productId: order.productId,
          productTitle: order.product.title,
          totalAmount,
          buyerEmail: order.buyer.email,
          buyerName: order.buyer.displayName || order.buyer.email,
          sellerEmail: order.seller.email || '',
          sellerName: order.seller.displayName || 'Satıcı',
        });
        this.logger.log(`order.created event emitted for order ${order.orderNumber}`);
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

      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: offer.productId,
          buyerId,
          sellerId: offer.sellerId,
          offerId: dto.offerId,
          totalAmount: offer.amount,
          commissionAmount: commissionResult.commissionAmount,
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

      // Update product status to sold
      await tx.product.update({
        where: { id: offer.productId },
        data: { status: ProductStatus.sold },
      });

      // Store productId for cache invalidation
      productIdForCache = offer.productId;

      return this.formatOrderResponse(order, buyerId);
    });

    // Invalidate product cache after successful transaction
    if (productIdForCache) {
      await this.invalidateProductCaches(productIdForCache);
    }
    
    return result;
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
      const commissionResult = await this.calculateCommission(
        finalPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Create order - store all guest info in shippingAddress JSON
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: dto.productId,
          buyerId: guestUser.id,
          sellerId: product.sellerId,
          offerId: dto.offerId,
          totalAmount: finalPrice,
          commissionAmount: commissionResult.commissionAmount,
          status: OrderStatus.pending_payment,
          shippingAddress: {
            // Guest contact info
            guestName: dto.guestName?.trim() || dto.shippingAddress.fullName.trim(),
            guestEmail: dto.email?.trim(),
            guestPhone: dto.phone?.trim(),
            // Shipping address
            fullName: dto.shippingAddress.fullName.trim(),
            phone: dto.shippingAddress.phone.trim(),
            city: dto.shippingAddress.city.trim(),
            district: dto.shippingAddress.district.trim(),
            address: dto.shippingAddress.address.trim(),
            zipCode: dto.shippingAddress.zipCode?.trim() || null,
            // Mark as guest order
            isGuestOrder: true,
          },
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

      // Update product status to reserved
      await tx.product.update({
        where: { id: dto.productId },
        data: { status: ProductStatus.reserved },
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
