import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import {
  CreateOrderDto,
  GuestCheckoutDto,
  DirectBuyDto,
  GuestSendVerificationCodeDto,
  CheckoutDto,
  GuestCheckoutGroupDto,
} from './dto';
import { OrderStatus, OfferStatus, ProductStatus, Prisma } from '@prisma/client';
import { getAvailableQuantity } from '../product/helpers/product-availability.helper';
import { generateUniqueReference } from '../../common/helpers/generate-reference';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { DiscountService } from '../discount';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { normalizeSuratPhone, normalizeSuratLocation } from '../surat-cargo/surat-address.util';
import { mapSuratFailureToHttpException } from '../surat-cargo/surat-result.mapper';
import { TaxService } from '../tax/tax.service';
import type { SuratShipmentFailure } from '../surat-cargo/surat-cargo.types';
import { SuratKargoTuru, SuratOdemeTipi, SuratTasimaSekli, SuratTeslimSekli, SuratGonderiSekli } from '../surat-cargo/surat-cargo.types';
import { OrderPricingService, CommissionResult } from './order-pricing.service';
import { OrderCommonService } from './order-common.service';

/**
 * Sipariş oluşturma / checkout akışları (buy-now, toplu checkout, teklif→sipariş,
 * misafir checkout + OTP) — OrderService'ten birebir taşındı. OrderService aynı
 * imzalarla buraya delege eder.
 */
@Injectable()
export class OrderCheckoutService {
  private readonly logger = new Logger(OrderCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly discountService: DiscountService,
    private readonly suratCargoService: SuratCargoService,
    private readonly taxService: TaxService,
    private readonly orderPricing: OrderPricingService,
    private readonly orderCommon: OrderCommonService,
  ) {}

  private buildSuratIdempotencyKey(parts: string[]): string {
    return createHash('sha256').update(parts.filter((p) => p.length > 0).join('|')).digest('hex');
  }

  /** KDV: satıcı kurumsal (businessStatus=approved + taxId dolu) ise ürün fiyatı üzerinden vergi hesapla. */
  private async resolveSellerTax(sellerId: string, categoryId: string | null, subtotal: number): Promise<number> {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { businessStatus: true, taxId: true },
    });
    if (seller?.businessStatus !== 'approved' || !seller?.taxId) return 0;
    const resolved = await this.taxService.resolveTaxRate('TR', null, categoryId);
    return resolved ? this.taxService.calculateTaxAmount(subtotal, resolved) : 0;
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
        Il: normalizeSuratLocation(ctx.recipientCity),
        Ilce: normalizeSuratLocation(ctx.recipientDistrict),
        TelefonCep: normalizeSuratPhone(ctx.recipientPhone),
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
      const commissionResult = await this.orderPricing.calculateCommission(
        discountedPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Calculate shipping cost (free shipping for orders >= 500 TL)
      const shippingCost = await this.orderPricing.calculateShippingCost(discountedPrice);
      // KDV: kurumsal satıcı ise ürün fiyatı üzerinden
      const taxAmount = await this.resolveSellerTax(product.sellerId, product.categoryId, discountedPrice);
      // Buyer fee + KDV eklenir
      const totalAmount = discountedPrice + shippingCost + commissionResult.buyerFeeAmount + taxAmount;

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
          taxAmount,
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

      // Hızlı Al (buy-now) sepeti atlar ama alıcı ürünü sepetinde de tutuyor olabilir.
      // Sipariş oluştu → sepetteki bu ürünü server-side kaldır ki iptal sonrası "tekrar
      // sipariş" akışında bayat sepet satırı kalmasın. Sepette yoksa deleteMany no-op.
      await tx.cartItem.deleteMany({
        where: { cart: { userId: buyerId }, productId: dto.productId },
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
    await this.orderCommon.invalidateProductCaches(result.productId);

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

  async createCheckoutGroup(params: {
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

        // Aynı alıcının aynı ürün için eski bekleyen siparişi varsa iptal et ve
        // rezervasyonunu bırak — yoksa terk edilmiş checkout rezervasyonu yeni
        // denemede "stokta yok" hatasına yol açar. Bu, stok doğrulamasından ÖNCE
        // yapılmalı ki serbest kalan rezervasyon aşağıdaki product fetch'inde görünsün.
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
                // Adet bazlı: rezervasyon stale.quantity kadar açılır (1 değil) →
                // çoklu-adet terk edilmiş sipariş rezervasyonu sızmasın.
                data: { reservedQuantity: { decrement: stale.quantity ?? 1 } },
              });
            }
          }
        }

        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: {
            seller: { select: { id: true, email: true, displayName: true } },
          },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        // Adet haritası: aynı ürün sepette birden çok kez ise adetleri topla.
        const qtyByProduct = new Map<string, number>();
        for (const it of dto.items) {
          qtyByProduct.set(
            it.productId,
            (qtyByProduct.get(it.productId) ?? 0) + (it.quantity ?? 1),
          );
        }

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
          const reqQty = qtyByProduct.get(productId) ?? 1;
          if (available !== null && available < reqQty) {
            throw new BadRequestException({
              message: `"${product.title}" için yeterli stok yok (istenen ${reqQty}, mevcut ${available})`,
              productId,
            });
          }
          if (!isGuest && product.sellerId === buyerId) {
            throw new ForbiddenException('Kendi ürününüzü satın alamazsınız');
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
            quantity: qtyByProduct.get(productId) ?? 1,
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
              // Adet bazlı: kupon doğrulama/indirim dağıtımı gerçek adetle yapılmalı
              // (1 değil) → yoksa yüzde kupon, minCartValue, maxDiscount tek-birim
              // fiyat üzerinden hesaplanıp çoklu-adet sepette alıcıyı fazla yükler.
              cartItems: productIds.map((productId) => ({
                productId,
                quantity: qtyByProduct.get(productId) ?? 1,
              })),
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
            // Kupon, satır toplamına (birim fiyat * adet) oranla dağıtılır.
            const priceSum = pricing.reduce((sum, p) => sum + p.productPrice * p.quantity, 0);
            let allocated = 0;
            pricing.forEach((p, idx) => {
              if (idx === pricing.length - 1) {
                p.couponDiscount = Math.round((totalCoupon - allocated) * 100) / 100;
              } else {
                p.couponDiscount =
                  Math.round(((totalCoupon * p.productPrice * p.quantity) / priceSum) * 100) / 100;
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
          taxAmount: number;
          totalAmount: number;
          suratIdempotencyKey: string;
        }> = [];

        for (const entry of pricing) {
          // Satır toplamı = birim fiyat * adet - (satıra düşen kupon). Komisyon,
          // kargo ve vergi satır toplamı üzerinden hesaplanır (adet>1 ölçeklenir).
          const lineSubtotal = entry.productPrice * entry.quantity;
          const discountedPrice = lineSubtotal - entry.couponDiscount;
          const commissionResult = await this.orderPricing.calculateCommission(
            discountedPrice,
            entry.product.sellerId,
            entry.product.categoryId,
          );
          const shippingCost = await this.orderPricing.calculateShippingCost(discountedPrice);
          const taxAmount = await this.resolveSellerTax(entry.product.sellerId, entry.product.categoryId, discountedPrice);
          const totalAmount =
            discountedPrice + shippingCost + commissionResult.buyerFeeAmount + taxAmount;
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
            taxAmount,
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
              quantity: entry.quantity,
              unitPrice: entry.productPrice,
              totalAmount: input.totalAmount,
              subtotal: entry.originalPrice * entry.quantity,
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
              taxAmount: input.taxAmount,
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
            data: { reservedQuantity: { increment: entry.quantity } },
          });

          createdOrders.push({
            id: order.id,
            orderNumber: order.orderNumber,
            productId: entry.productId,
            totalAmount: input.totalAmount,
            subtotal: entry.originalPrice * entry.quantity,
            discountAmount: totalDiscount,
            productTitle: entry.product.title,
            sellerId: entry.product.sellerId,
            sellerEmail: entry.product.seller?.email ?? null,
            sellerName: entry.product.seller?.displayName ?? null,
          });
        }

        // Sipariş(ler) oluşturuldu → alıcının sepetindeki bu ürünleri server-side kaldır.
        // Sepet eskiden yalnız client-side (ödeme başlatılınca) temizleniyordu; kullanıcı
        // ödemeye geçmeden iptal edince bayat sepet satırı kalıyor, "tekrar sipariş" akışını
        // bozuyordu. Misafirde server sepeti yoktur → deleteMany no-op (güvenli). cart.userId
        // ile kapsamlanır: yalnız BU alıcının satırları, yalnız sipariş edilen ürünler.
        if (!isGuest) {
          await tx.cartItem.deleteMany({
            where: { cart: { userId: buyerId }, productId: { in: productIds } },
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
      await this.orderCommon.invalidateProductCaches(order.productId);
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
      const commissionResult = await this.orderPricing.calculateCommission(
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

      // KDV: kurumsal satıcı ise ürün fiyatı üzerinden
      const offerTaxAmount = await this.resolveSellerTax(offer.sellerId, offer.product.categoryId, Number(offer.amount));
      // Buyer fee + KDV eklenir
      const totalAmount = Number(offer.amount) + commissionResult.buyerFeeAmount + offerTaxAmount;

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
          taxAmount: offerTaxAmount,
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

      return await this.orderCommon.formatOrderResponse(order, buyerId);
    });

    // Invalidate product cache after successful transaction
    if (productIdForCache) {
      await this.orderCommon.invalidateProductCaches(productIdForCache);
      
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

      // NOTE: We intentionally do NOT notify the seller here. This runs at order creation
      // (status pending_payment) — e.g. when a buyer turns an accepted offer into an order —
      // before payment is confirmed and the order may still be abandoned. The seller is
      // notified only after payment succeeds, via the order.paid event ("Yeni Sipariş" email + push).

      // Notify users who have this product in wishlist
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

  /**
   * Misafir checkout e-postası zaten kayıtlı bir hesaba aitse engelle.
   * Kullanıcı bu e-postayla giriş yapıp normal (üye) akışı kullanmalı.
   * case-insensitive: kullanıcı e-postaları DB'de orijinal case ile saklanabiliyor.
   * Sistem misafir kullanıcısı (guest@tarodan.system) bu kontrole takılmaz —
   * onun e-postası normalize edilmiş bir kullanıcı e-postasıyla eşleşmez.
   */
  private async assertGuestEmailNotRegistered(normEmail: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: normEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      // ConflictException (409) + makine-okunur kod → frontend giriş'e yönlendirir.
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message:
          'Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapıp alışverişe devam edin.',
      });
    }
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

    // Zaten kayıtlı bir hesabın e-postasıyla misafir alışverişe izin verme:
    // hiç kod göndermeden "bu e-posta kayıtlı, giriş yapın" de. (case-insensitive:
    // kullanıcı e-postaları DB'de orijinal case ile saklanıyor olabilir.)
    await this.assertGuestEmailNotRegistered(normEmail);

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
      throw new BadRequestException('Doğrulama kodu e-postası gönderilemedi');
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
    // Savunma derinliği: kod gönderildikten sonra bu e-postayla kayıt olunmuş
    // olabilir → siparişi oluşturmadan önce tekrar kontrol et.
    await this.assertGuestEmailNotRegistered(normEmail);
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
      const commissionResult = await this.orderPricing.calculateCommission(
        finalPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Calculate shipping cost (free shipping for orders >= 500 TL)
      const shippingCost = await this.orderPricing.calculateShippingCost(finalPrice);
      // KDV: kurumsal satıcı ise ürün fiyatı üzerinden
      const guestTaxAmount = await this.resolveSellerTax(product.sellerId, product.categoryId, finalPrice);
      // Buyer fee + KDV eklenir
      const totalAmount = finalPrice + shippingCost + commissionResult.buyerFeeAmount + guestTaxAmount;

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
          taxAmount: guestTaxAmount,
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

      // Adet bazlı rezervasyon: 1 adet rezerve et (invalidation yok — cron halledecek).
      // Bulgu F: yalnız DIRECT-BUY'da (offerId yok) create'de rezerve et. Teklif
      // siparişlerinde rezerv ödeme başlatınca (payment-initiate, offerId &&
      // !reservationReleasedAt) alınır — giriş yapmış kullanıcı modeliyle simetrik.
      // Aksi halde guest+teklif siparişi hem create'de hem initiate'te rezerve edip
      // ÇİFT rezerve eder (available negatife düşer).
      if (!dto.offerId) {
        await tx.product.update({
          where: { id: dto.productId },
          data: { reservedQuantity: { increment: 1 } },
        });
      }

      return {
        ...(await this.orderCommon.formatOrderResponse(order, guestUser.id)),
        guestEmail: dto.email,
        orderNumber: order.orderNumber,
        productId: dto.productId,
      };
    });

    // Invalidate product cache after successful transaction
    await this.orderCommon.invalidateProductCaches(dto.productId);

    return result;
  }
}
