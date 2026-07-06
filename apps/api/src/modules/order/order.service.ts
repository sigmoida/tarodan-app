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
import { OrderStatus, OfferStatus, SellerType, CommissionSellerType, MembershipTierType, Prisma } from '@prisma/client';
import { OrderPricingService, CommissionResult } from './order-pricing.service';
import { OrderCheckoutService } from './order-checkout.service';
import { OrderCommonService } from './order-common.service';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { getAvailableQuantity } from '../product/helpers/product-availability.helper';
import { ProductLockService } from '../product/product-lock.service';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { DiscountService, DiscountCalculator } from '../discount';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { TaxService } from '../tax/tax.service';

export { CommissionResult } from './order-pricing.service';

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
    private readonly taxService: TaxService,
    private readonly orderPricing: OrderPricingService,
    private readonly orderCheckout: OrderCheckoutService,
    private readonly orderCommon: OrderCommonService,
  ) {}

  // Taşındı: order-pricing.service.ts — imzalar aynen korunuyor (facade delege).

  async calculateShippingCost(orderAmount: number): Promise<number> {
    return this.orderPricing.calculateShippingCost(orderAmount);
  }

  async getFreeShippingInfo(orderAmount: number): Promise<{
    isFreeShipping: boolean;
    shippingCost: number;
    threshold: number;
    amountToFreeShipping: number;
  }> {
    return this.orderPricing.getFreeShippingInfo(orderAmount);
  }

  async getCheckoutQuote(dto: CheckoutQuoteDto): Promise<{
    itemsSubtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount: number;
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
      taxAmount: number;
      title?: string;
    }>;
    pricing: {
      subtotal: number;
      shippingAmount: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      commissionAmount: number;
      taxAmount: number;
      totalAmount: number;
      sellerNetAmount: number;
    };
  }> {
    return this.orderPricing.getCheckoutQuote(dto);
  }

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
    return this.orderPricing.getCommissionPreview(amount, sellerId, categoryId);
  }

  async getCommissionPreviewBatch(
    sellerId: string,
    items: Array<{ amount: number; categoryId?: string | null }>,
  ): Promise<{ results: Array<{ sellerFeeAmount: number; sellerNetAmount: number }> }> {
    return this.orderPricing.getCommissionPreviewBatch(sellerId, items);
  }

  async calculateCommission(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
  ): Promise<CommissionResult> {
    return this.orderPricing.calculateCommission(amount, sellerId, categoryId);
  }

  // Taşındı: order-checkout.service.ts — imzalar aynen korunuyor (facade delege).

  async createDirectOrder(buyerId: string, dto: DirectBuyDto) {
    return this.orderCheckout.createDirectOrder(buyerId, dto);
  }

  async checkout(buyerId: string, dto: CheckoutDto) {
    return this.orderCheckout.checkout(buyerId, dto);
  }

  async checkoutGuest(dto: GuestCheckoutGroupDto) {
    return this.orderCheckout.checkoutGuest(dto);
  }

  // Taşındı: order-checkout.service.ts — unit spec'ler private erişimle çağırdığı
  // için delege korunuyor (imza aynı).
  private createCheckoutGroup(params: {
    buyerId: string;
    dto: CheckoutDto;
    isGuest: boolean;
    guest?: { email: string; phone?: string; name?: string };
  }) {
    return this.orderCheckout.createCheckoutGroup(params);
  }

  async create(buyerId: string, dto: CreateOrderDto) {
    return this.orderCheckout.create(buyerId, dto);
  }

  async sendGuestCheckoutVerificationCode(dto: GuestSendVerificationCodeDto): Promise<{
    success: boolean;
    expiresInSeconds: number;
  }> {
    return this.orderCheckout.sendGuestCheckoutVerificationCode(dto);
  }

  async guestCheckout(dto: GuestCheckoutDto) {
    return this.orderCheckout.guestCheckout(dto);
  }

  // Taşındı: order-common.service.ts — kalan facade metodları bu delegeler
  // üzerinden akar (imzalar aynı).
  private async invalidateProductCaches(productId: string): Promise<void> {
    return this.orderCommon.invalidateProductCaches(productId);
  }

  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    return this.orderCommon.resolveProductImageUrl(imageKeyOrUrl);
  }

  private async formatOrderResponse(order: any, userId: string) {
    return this.orderCommon.formatOrderResponse(order, userId);
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
    const { status, role, refundsOnly, page = 1, limit = 20 } = query;

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

    if (refundsOnly) {
      // "İadeler" sekmesi: iade talebi olan TÜM siparişler (status'tan bağımsız).
      // İade tamamlanınca sipariş 'cancelled' olduğu için varsayılan/iptal filtreleri
      // bunları doğru gruplayamıyordu; burada status filtresi uygulanmaz.
      where.refundRequests = { some: {} };
    } else if (status) {
      // Varsayılan listede iptal edilen (ödeme başarısız vb.) siparişleri gösterme.
      // status tek değer veya dizi (çoklu: "İptal/İade" filtresi cancelled+refunded ister).
      where.status = Array.isArray(status) ? { in: status } : status;
    } else {
      // Varsayılan listede iptal edilen (ödeme başarısız vb.) siparişleri gösterme
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
        // Liste yanıtında da aktif iade durumunu gösterebilmek için (detayla tutarlı):
        // formatOrderResponse → pickActiveRefundRequest order.refundRequests'i okur;
        // include edilmezse activeRefundRequest null kalır ve liste ham order.status
        // (örn. "Teslim Edildi") gösterir. (Sadece okuma; başka davranış değişmez.)
        refundRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const formatted = await Promise.all(orders.map((o) => this.formatOrderResponse(o, userId)));

    // Kullanıcı hem alıcı hem satıcı olabilir (test ortamı).
    // Talep edilen role'e göre perspektif bayraklarını sabitle ki
    // satıcı tabında alıcı UI'ı (iade talebi butonu vb.) çıkmasın.
    const data = formatted.map((o) => {
      if (role === 'seller') return { ...o, isBuyer: false };
      if (role === 'buyer') return { ...o, isSeller: false };
      return o;
    });

    return {
      data,
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
        // Ödemeler checkout group üzerinden bağlanır (Payment.checkoutGroupId);
        // order.payment genellikle null olduğundan group payment'ı fallback olarak çek.
        checkoutGroup: { include: { payment: true } },
        // canReactivate hesabı için teklif durumu gerekir ("Ödemeyi tamamla"
        // yalnız teklif hâlâ accepted iken gösterilmeli)
        offer: { select: { status: true } },
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
            // Grup içi siparişlerde de "Ödeme Yapıldı"/paidAt çözülsün diye group payment.
            checkoutGroup: { include: { payment: true } },
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

      // YENİ ESCROW KURALI: completeOrder artık PaymentHold'u SERBEST BIRAKMAZ.
      // Satıcı payout'u tek otoriteden (releaseHoldsDue cron) ve yalnızca
      // teslim + returnWindow + grace dolunca + açık iade yokken yapılır. Alıcı
      // onayı / 48h auto-timeout payout'u erkene ALMAZ; ledger 'earned' yalnızca
      // muhasebe işaretidir (fiili ödeme = hold release).
      this.logger.log(
        `Order ${orderId} completed (type=${type}); ledger=${ledgerResult.updated}; hold release escrow cron'a bırakıldı`,
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

      // Update order. cancellationType='iptal': kargo öncesi iptal — status para
      // akışı için (paid/preparing'de 'refunded' tetikler) ama bu alan raporlama/
      // admin için "İADE değil İPTAL" der. reason opsiyonel; boşsa genel default.
      const cancelReasonText =
        dto?.reason?.trim() || 'Alıcı tarafından iptal edildi';
      const cancelledOrder = await tx.order.update({
        where: {
          id: orderId,
          version: order.version,
        },
        data: {
          status: newStatus,
          cancellationType: 'iptal',
          cancelReason: cancelReasonText,
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

      // Rezervasyonu kaldır (pending_payment ise sipariş adedi kadar serbest bırak).
      // GUARD: reservationReleasedAt doluysa rezervasyon 5dk cron (releaseExpiredOrder
      // Reservations) tarafından ZATEN bırakılmıştır; sipariş pending_payment kalsa da
      // burada 2. kez düşmemeliyiz — yoksa reservedQuantity negatife düşer (oversell).
      // CLAMP: GREATEST(...,0) ile atomik + 0'a sabitli (read-modify-write yarışına kapalı),
      // invalidatePendingOrdersForProduct'taki pattern ile aynı.
      if (
        order.status === OrderStatus.pending_payment &&
        !order.reservationReleasedAt
      ) {
        await tx.$executeRaw`
          UPDATE "products"
          SET "reserved_quantity" = GREATEST("reserved_quantity" - ${order.quantity ?? 1}, 0)
          WHERE "id" = ${order.productId}
        `;
      }

      // Ödenmiş sipariş iptali (newStatus=refunded): fiziksel stoğu BURADA, iptalle aynı
      // transaction'da geri yükle — PayTR para iadesini BEKLEMEDEN. Böylece tekil ürün,
      // iade PayTR'de sürerken/başarısızken piyasadan silinmez (envanter müsaitliği ≠ para
      // iadesi). Para iadesi processRefund cron'unda bağımsız yürür. Idempotency: stok bir
      // kez geri yüklenir, stockRestoredAt işaretlenir; processRefund bu doluysa stok-restore'u
      // atlar (çift geri-yükleme yok). Adet bazlı → batch-safe. pending_payment'ta quantity hiç
      // düşmediği için (yalnız reserved rezerve edilir) stok geri-yükleme YALNIZ paid/preparing
      // içindir; o state'ler zaten pre-shipping (kargolanan iptal edilemez, yukarıda bloklu).
      if (newStatus === OrderStatus.refunded && !order.stockRestoredAt) {
        const restoreQty = order.quantity ?? 1;
        const prod = await tx.product.findUnique({
          where: { id: order.productId },
          select: { quantity: true },
        });
        if (
          prod &&
          prod.quantity !== null &&
          prod.quantity !== undefined &&
          restoreQty > 0
        ) {
          const newQty = prod.quantity + restoreQty;
          await tx.product.update({
            where: { id: order.productId },
            data: {
              quantity: { increment: restoreQty },
              status: getProductStatusFromQuantity(newQty),
            },
          });
        }
        await tx.order.update({
          where: { id: orderId },
          data: { stockRestoredAt: new Date() },
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
}
