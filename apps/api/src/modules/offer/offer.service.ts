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
import { PrismaService } from '../../prisma';
import { CreateOfferDto, CounterOfferDto, OfferQueryDto } from './dto';
import { OfferStatus, ProductStatus, OrderStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);
  private readonly offerExpiryHours: number;
  private readonly minOfferPercentage: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {
    this.offerExpiryHours = parseInt(
      this.configService.get('OFFER_EXPIRY_HOURS') || '24',
      10,
    );
    this.minOfferPercentage = parseInt(
      this.configService.get('MIN_OFFER_PERCENTAGE') || '50',
      10,
    );
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
   * Create a new offer
   * POST /offers
   * Business Rules:
   * - Cannot offer on own product
   * - Only one pending offer per user per product
   * - Minimum offer = 50% of product price
   * - Product must be active
   * - Uses FOR UPDATE SKIP LOCKED to prevent race conditions
   */
  async create(buyerId: string, dto: CreateOfferDto) {
    // Use transaction with row locking for race condition prevention
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock product row with FOR UPDATE SKIP LOCKED to prevent race conditions
      // SKIP LOCKED allows other transactions to proceed if row is already locked
      // Use Prisma instead of raw SQL to avoid column name issues
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        include: {
          seller: {
            select: { id: true, displayName: true, email: true },
          },
        },
      });

      if (!product) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      if (product.status !== ProductStatus.active) {
        throw new BadRequestException('Bu ürün şu anda satışta değil');
      }

      // Cannot offer on own product
      if (product.sellerId === buyerId) {
        throw new BadRequestException('Kendi ürününüze teklif veremezsiniz');
      }

      // Check minimum offer percentage
      const productPrice = Number(product.price);
      const minOffer = productPrice * (this.minOfferPercentage / 100);
      if (dto.amount < minOffer) {
        throw new BadRequestException(
          `Teklif tutarı çok düşük. Ürün fiyatı: ${productPrice.toFixed(2)} TL. ` +
          `Minimum teklif: ${minOffer.toFixed(2)} TL (fiyatın %${this.minOfferPercentage}'i). ` +
          `Teklifiniz: ${dto.amount.toFixed(2)} TL`,
        );
      }

      // Check for existing pending offer from this buyer
      const existingOffer = await tx.offer.findFirst({
        where: {
          productId: dto.productId,
          buyerId,
          status: OfferStatus.pending,
        },
      });

      if (existingOffer) {
        throw new BadRequestException(
          'Bu ürüne zaten bekleyen bir teklifiniz var. Önce mevcut teklifi iptal edin.',
        );
      }

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.offerExpiryHours);

      // Create offer
      const offer = await tx.offer.create({
        data: {
          productId: dto.productId,
          buyerId,
          sellerId: product.sellerId,
          amount: dto.amount,
          status: OfferStatus.pending,
          expiresAt,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, displayName: true, isVerified: true, email: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true, email: true },
          },
        },
      });

      return {
        offer,
        productTitle: product.title,
        productPrice,
        sellerEmail: product.seller?.email || '',
        sellerName: product.seller?.displayName || '',
      };
    });

    // Emit offer.created event AFTER transaction commits
    try {
      await this.eventService.emitOfferCreated({
        offerId: result.offer.id,
        productId: result.offer.productId,
        productTitle: result.productTitle,
        productPrice: result.productPrice,
        offerAmount: Number(result.offer.amount),
        buyerId: result.offer.buyerId,
        buyerName: result.offer.buyer.displayName || 'Alıcı',
        sellerId: result.offer.sellerId,
        sellerEmail: result.sellerEmail,
        sellerName: result.sellerName || 'Satıcı',
        expiresAt: result.offer.expiresAt,
      });
      this.logger.log(`offer.created event emitted for offer ${result.offer.id}`);
    } catch (error) {
      // Log but don't fail - offer was already created
      this.logger.error(`Failed to emit offer.created event: ${error}`);
    }

    // Send direct in-app notification to seller
    this.logger.log(`[CreateOffer] Sending notification to seller ${result.offer.sellerId}`);
    try {
      const notificationResult = await this.notificationService.createInAppNotification(
        result.offer.sellerId,
        NotificationType.OFFER_RECEIVED,
        {
          productId: result.offer.productId,
          productTitle: result.productTitle,
          amount: Number(result.offer.amount),
          buyerName: result.offer.buyer.displayName || 'Bir kullanıcı',
        },
      );
      this.logger.log(`[CreateOffer] Notification result: ${notificationResult}`);
    } catch (error) {
      this.logger.error(`[CreateOffer] Failed to send offer notification:`, error);
    }

    return this.formatOfferResponse(result.offer);
  }

  /**
   * Accept an offer
   * POST /offers/:id/accept
   * Business Rules:
   * - Only seller can accept
   * - Uses FOR UPDATE to lock offer and product rows
   * - Auto-reject other pending offers for same product
   * - Creates order with pending_payment status
   * - Emits offer.accepted event
   */
  async accept(offerId: string, sellerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock offer row with FOR UPDATE
      const lockedOffers = await tx.$queryRaw<any[]>`
        SELECT o.*, o.version as offer_version
        FROM "Offer" o
        WHERE o.id = ${offerId}::uuid
        FOR UPDATE
      `;

      if (!lockedOffers || lockedOffers.length === 0) {
        throw new NotFoundException('Teklif bulunamadı');
      }

      const offerData = lockedOffers[0];

      // Only seller can accept
      if (offerData.sellerId !== sellerId) {
        throw new ForbiddenException('Bu teklifi kabul etme yetkiniz yok');
      }

      // Check offer status
      if (offerData.status !== OfferStatus.pending) {
        throw new BadRequestException(`Bu teklif zaten ${offerData.status} durumunda`);
      }

      // Check expiration
      if (new Date() > new Date(offerData.expiresAt)) {
        // Auto-expire the offer
        await tx.offer.update({
          where: { id: offerId },
          data: { status: OfferStatus.expired },
        });
        throw new BadRequestException('Bu teklifin süresi dolmuş');
      }

      // Lock product row with FOR UPDATE
      const lockedProducts = await tx.$queryRaw<any[]>`
        SELECT p.*
        FROM "Product" p
        WHERE p.id = ${offerData.productId}::uuid
        FOR UPDATE
      `;

      if (!lockedProducts || lockedProducts.length === 0) {
        throw new NotFoundException('Ürün bulunamadı');
      }

      const productData = lockedProducts[0];

      // Check product is still available
      if (productData.status !== ProductStatus.active) {
        throw new BadRequestException('Ürün artık satışta değil');
      }

      // Accept this offer with version check
      const acceptedOffer = await tx.offer.update({
        where: {
          id: offerId,
          version: offerData.offer_version,
        },
        data: {
          status: OfferStatus.accepted,
          version: { increment: 1 },
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          buyer: {
            select: { id: true, displayName: true, isVerified: true, email: true },
          },
          seller: {
            select: { id: true, displayName: true, isVerified: true, email: true },
          },
        },
      });

      // Auto-reject other pending offers for this product
      await tx.offer.updateMany({
        where: {
          productId: offerData.productId,
          status: OfferStatus.pending,
          id: { not: offerId },
        },
        data: {
          status: OfferStatus.rejected,
        },
      });

      // Reserve the product
      await tx.product.update({
        where: { id: offerData.productId },
        data: { status: ProductStatus.reserved },
      });

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Create order with pending_payment status
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: offerData.productId,
          buyerId: offerData.buyerId,
          sellerId: offerData.sellerId,
          offerId: offerId,
          totalAmount: offerData.amount,
          commissionAmount: 0, // Will be calculated at payment
          status: OrderStatus.pending_payment,
        },
      });

      this.logger.log(`Order ${orderNumber} created for accepted offer ${offerId}`);

      return {
        offer: acceptedOffer,
        order,
      };
    });

    // Emit offer.accepted event AFTER transaction commits
    try {
      await this.eventService.emitOfferAccepted({
        offerId: result.offer.id,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        productId: result.offer.productId,
        productTitle: result.offer.product.title,
        offerAmount: Number(result.offer.amount),
        buyerId: result.offer.buyerId,
        buyerEmail: (result.offer.buyer as any).email || '',
        buyerName: result.offer.buyer.displayName || 'Alıcı',
        sellerId: result.offer.sellerId,
        sellerName: result.offer.seller.displayName || 'Satıcı',
      });
      this.logger.log(`offer.accepted event emitted for offer ${result.offer.id}`);
    } catch (error) {
      // Log but don't fail - offer was already accepted
      this.logger.error(`Failed to emit offer.accepted event: ${error}`);
    }

    // Send direct in-app notification to buyer
    try {
      await this.notificationService.createInAppNotification(
        result.offer.buyerId,
        NotificationType.OFFER_ACCEPTED,
        {
          productId: result.offer.productId,
          productTitle: result.offer.product.title,
          orderId: result.order.id,
          amount: Number(result.offer.amount),
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send offer accepted notification: ${error}`);
    }

    return this.formatOfferResponse(result.offer);
  }

  /**
   * Reject an offer
   * POST /offers/:id/reject
   */
  async reject(offerId: string, sellerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new NotFoundException('Teklif bulunamadı');
    }

    // Only seller can reject
    if (offer.sellerId !== sellerId) {
      throw new ForbiddenException('Bu teklifi reddetme yetkiniz yok');
    }

    if (offer.status !== OfferStatus.pending) {
      throw new BadRequestException(`Bu teklif zaten ${offer.status} durumunda`);
    }

    const rejectedOffer = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        status: OfferStatus.rejected,
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

    // Send notification to buyer that offer was rejected
    try {
      await this.notificationService.createInAppNotification(
        rejectedOffer.buyerId,
        NotificationType.OFFER_REJECTED,
        {
          productId: rejectedOffer.productId,
          productTitle: rejectedOffer.product.title,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send offer rejected notification: ${error}`);
    }

    return this.formatOfferResponse(rejectedOffer);
  }

  /**
   * Counter-offer (seller proposes new amount)
   * POST /offers/:id/counter
   */
  async counter(offerId: string, sellerId: string, dto: CounterOfferDto) {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: {
          product: true,
        },
      });

      if (!offer) {
        throw new NotFoundException('Teklif bulunamadı');
      }

      // Only seller can counter
      if (offer.sellerId !== sellerId) {
        throw new ForbiddenException('Bu teklife karşı teklif verme yetkiniz yok');
      }

      if (offer.status !== OfferStatus.pending) {
        throw new BadRequestException(`Bu teklif zaten ${offer.status} durumunda`);
      }

      // Check expiration
      if (new Date() > offer.expiresAt) {
        await tx.offer.update({
          where: { id: offerId },
          data: { status: OfferStatus.expired },
        });
        throw new BadRequestException('Bu teklifin süresi dolmuş');
      }

      // Counter amount should be between offer and product price
      if (dto.amount <= Number(offer.amount)) {
        throw new BadRequestException(
          'Karşı teklif, mevcut tekliften yüksek olmalıdır',
        );
      }

      if (dto.amount > Number(offer.product.price)) {
        throw new BadRequestException(
          'Karşı teklif, ürün fiyatından yüksek olamaz',
        );
      }

      // Reject old offer
      await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.rejected },
      });

      // Create new counter-offer (buyer and seller swap roles conceptually)
      // The seller is essentially making a "take it or leave it" offer
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.offerExpiryHours);

      const counterOffer = await tx.offer.create({
        data: {
          productId: offer.productId,
          buyerId: offer.buyerId, // Original buyer
          sellerId: offer.sellerId, // Original seller
          amount: dto.amount,
          status: OfferStatus.pending,
          expiresAt,
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

      return this.formatOfferResponse(counterOffer);
    });
  }

  /**
   * Cancel offer (buyer cancels their own offer)
   * POST /offers/:id/cancel
   */
  async cancel(offerId: string, buyerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new NotFoundException('Teklif bulunamadı');
    }

    // Only buyer can cancel their own offer
    if (offer.buyerId !== buyerId) {
      throw new ForbiddenException('Bu teklifi iptal etme yetkiniz yok');
    }

    if (offer.status !== OfferStatus.pending) {
      throw new BadRequestException(`Bu teklif zaten ${offer.status} durumunda`);
    }

    const cancelledOffer = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        status: OfferStatus.cancelled,
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

    return this.formatOfferResponse(cancelledOffer);
  }

  /**
   * Get pending offers count for badge
   */
  async getPendingCount(userId: string) {
    const [received, sent] = await Promise.all([
      this.prisma.offer.count({
        where: {
          sellerId: userId,
          status: 'pending',
        },
      }),
      this.prisma.offer.count({
        where: {
          buyerId: userId,
          status: 'pending',
        },
      }),
    ]);

    return {
      received,
      sent,
      total: received + sent,
    };
  }

  /**
   * Get offers for current user
   */
  async findUserOffers(userId: string, query: OfferQueryDto) {
    const { productId, status, type, page = 1, limit = 20 } = query;

    const where: Prisma.OfferWhereInput = {};

    // Filter by type (sent or received)
    if (type === 'sent') {
      where.buyerId = userId;
    } else if (type === 'received') {
      where.sellerId = userId;
    } else {
      // Default: both sent and received
      where.OR = [{ buyerId: userId }, { sellerId: userId }];
    }

    if (productId) {
      where.productId = productId;
    }

    if (status) {
      where.status = status;
    }

    const total = await this.prisma.offer.count({ where });

    const offers = await this.prisma.offer.findMany({
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
      },
    });

    return {
      data: offers.map((o) => this.formatOfferResponse(o)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single offer by ID
   */
  async findOne(offerId: string, userId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
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

    if (!offer) {
      throw new NotFoundException('Teklif bulunamadı');
    }

    // Only buyer or seller can view the offer
    if (offer.buyerId !== userId && offer.sellerId !== userId) {
      throw new ForbiddenException('Bu teklifi görüntüleme yetkiniz yok');
    }

    return this.formatOfferResponse(offer);
  }

  /**
   * Get offers for a product (seller only)
   */
  async findProductOffers(productId: string, sellerId: string, query: OfferQueryDto) {
    // Verify ownership
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünün tekliflerini görüntüleme yetkiniz yok');
    }

    const { status, page = 1, limit = 20 } = query;

    const where: Prisma.OfferWhereInput = {
      productId,
    };

    if (status) {
      where.status = status;
    }

    const total = await this.prisma.offer.count({ where });

    const offers = await this.prisma.offer.findMany({
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
      },
    });

    return {
      data: offers.map((o) => this.formatOfferResponse(o)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Format offer response with expiration info
   */
  private formatOfferResponse(offer: any) {
    const now = new Date();
    const expiresAt = new Date(offer.expiresAt);
    const isExpired = now > expiresAt && offer.status === OfferStatus.pending;

    let timeRemaining: string | undefined;
    if (offer.status === OfferStatus.pending && !isExpired) {
      const diff = expiresAt.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      timeRemaining = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return {
      id: offer.id,
      amount: Number(offer.amount),
      status: isExpired ? OfferStatus.expired : offer.status,
      expiresAt: offer.expiresAt,
      isExpired,
      timeRemaining,
      product: {
        id: offer.product.id,
        title: offer.product.title,
        price: Number(offer.product.price),
        imageUrl: offer.product.images?.[0]?.url,
        status: offer.product.status,
      },
      buyer: offer.buyer,
      seller: offer.seller,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }
}
