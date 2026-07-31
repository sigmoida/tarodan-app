import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { isPublicStorageKey, StorageService } from "../storage/storage.service";
import { CreateOfferDto, CounterOfferDto, OfferQueryDto } from "./dto";
import {
  OfferStatus,
  ProductStatus,
  OrderStatus,
  Prisma,
} from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { EventService } from "../events";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { OrderService } from "../order/order.service";
import { OrderCheckoutCommonService } from "../order/order-checkout-common.service";
import { ProductLockService } from "../product/product-lock.service";
import { getAvailableQuantity } from "../product/helpers/product-availability.helper";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { i18nMessage } from "../i18n";

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);
  private readonly offerExpiryHours: number;
  private readonly minOfferPercentage: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    private readonly orderService: OrderService,
    private readonly productLockService: ProductLockService,
    @Optional()
    private readonly storageService: StorageService,
    // Teklif siparişinin bedelleri (kargo + KDV + stopaj + toplam) normal satışla
    // AYNI primitiften gelir; burada ayrı hesap yapılmaz.
    private readonly checkoutCommon: OrderCheckoutCommonService,
  ) {
    this.offerExpiryHours = parseInt(
      this.configService.get("OFFER_EXPIRY_HOURS") || "24",
      10,
    );
    this.minOfferPercentage = parseInt(
      this.configService.get("MIN_OFFER_PERCENTAGE") || "50",
      10,
    );
  }

  /**
   * Generate a non-guessable, unique order number (e.g. "ORD-K7X9M2QF3N").
   * Shares the same generator as OrderService so the format stays consistent.
   */
  private async generateOrderNumber(): Promise<string> {
    return generateUniqueReference(
      REFERENCE_PREFIX.order,
      async (code) =>
        (await this.prisma.order.count({ where: { orderNumber: code } })) > 0,
    );
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
        throw new NotFoundException(
          i18nMessage("server.offer.productNotFound"),
        );
      }

      if (product.status !== ProductStatus.active) {
        throw new BadRequestException(
          i18nMessage("server.offer.productNotActive"),
        );
      }

      // Adet bazlı: en az 1 müsait adet olmalı
      const available = getAvailableQuantity(product);
      if (available !== null && available < 1) {
        throw new BadRequestException(
          i18nMessage("server.offer.productOutOfStock"),
        );
      }

      // Cannot offer on own product
      if (product.sellerId === buyerId) {
        throw new BadRequestException(
          i18nMessage("server.offer.cannotOfferOwnProduct"),
        );
      }

      // Check minimum offer percentage
      const productPrice = Number(product.price);
      const minOffer = productPrice * (this.minOfferPercentage / 100);
      if (dto.amount < minOffer) {
        throw new BadRequestException(
          i18nMessage("server.offer.belowMinimumOffer", {
            productPrice: productPrice.toFixed(2),
            minOffer: minOffer.toFixed(2),
            minOfferPercentage: this.minOfferPercentage,
            offerAmount: dto.amount.toFixed(2),
          }),
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
          i18nMessage("server.offer.alreadyPendingOffer"),
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
          message: dto.message || null,
          status: OfferStatus.pending,
          expiresAt,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
          buyer: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              email: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      return {
        offer,
        productTitle: product.title,
        productPrice,
        sellerEmail: product.seller?.email || "",
        sellerName: product.seller?.displayName || "",
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
        buyerName: result.offer.buyer.displayName || "Alıcı",
        sellerId: result.offer.sellerId,
        sellerEmail: result.sellerEmail,
        sellerName: result.sellerName || "Satıcı",
        expiresAt: result.offer.expiresAt,
      });
      this.logger.log(
        `offer.created event emitted for offer ${result.offer.id}`,
      );
    } catch (error) {
      // Log but don't fail - offer was already created
      this.logger.error(`Failed to emit offer.created event: ${error}`);
    }

    return await this.formatOfferResponse(result.offer);
  }

  /**
   * Accept an offer
   * POST /offers/:id/accept
   * Business Rules:
   * - Normal teklif: yalnızca satıcı kabul eder
   * - Karşı teklif (buyerMustAccept): yalnızca alıcı kabul eder
   * - Uses FOR UPDATE to lock offer and product rows
   * - Auto-reject other pending offers for same product
   * - Creates order with pending_payment status
   * - Emits offer.accepted event
   */
  async accept(offerId: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock offer row with FOR UPDATE
      const lockedOffers = await tx.$queryRaw<{ id: string }[]>`
        SELECT o.id
        FROM "offers" o
        WHERE o.id = ${offerId}
        FOR UPDATE
      `;

      if (!lockedOffers || lockedOffers.length === 0) {
        throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
      }

      const offerData = await tx.offer.findUnique({
        where: { id: offerId },
      });

      if (!offerData) {
        throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
      }

      const mustBuyerAccept = Boolean(offerData.buyerMustAccept);
      if (mustBuyerAccept) {
        if (offerData.buyerId !== userId) {
          throw new ForbiddenException(
            i18nMessage("server.offer.onlyBuyerCanAcceptCounter"),
          );
        }
      } else if (offerData.sellerId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.offer.notAuthorizedToAccept"),
        );
      }

      // Check offer status
      if (offerData.status !== OfferStatus.pending) {
        throw new BadRequestException(
          i18nMessage("server.offer.alreadyInStatus", {
            status: offerData.status,
          }),
        );
      }

      // Check expiration
      if (new Date() > new Date(offerData.expiresAt)) {
        // Auto-expire the offer
        await tx.offer.update({
          where: { id: offerId },
          data: { status: OfferStatus.expired },
        });
        throw new BadRequestException(i18nMessage("server.offer.offerExpired"));
      }

      // Lock product row and check availability (prevents race with direct buy / trade accept)
      const productData = await this.productLockService.lockProductForUpdate(
        tx,
        offerData.productId,
      );

      if (!productData) {
        throw new NotFoundException(
          i18nMessage("server.offer.productNotFound"),
        );
      }

      if (productData.status !== ProductStatus.active) {
        throw new BadRequestException(
          i18nMessage("server.offer.productNoLongerActive"),
        );
      }

      const available = getAvailableQuantity(productData);
      if (available !== null && available < 1) {
        throw new BadRequestException(
          i18nMessage("server.offer.insufficientStock"),
        );
      }

      // Accept this offer with version check
      const acceptedOffer = await tx.offer.update({
        where: {
          id: offerId,
          version: offerData.version,
        },
        data: {
          status: OfferStatus.accepted,
          version: { increment: 1 },
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
          buyer: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              email: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Teklif kabul = sadece anlaşma. Stok değişmez, invalidation yok.
      // Reserve, ödeme başlatıldığında (payment initiate) yapılacak.

      // Bedeller: komisyon + kargo payı + KDV + stopaj + tahsil edilecek toplam.
      // Eskiden yalnız komisyon hesaplanıyor, KDV/stopaj/kargo @default(0) kalıyordu →
      // kurumsal satıcının teklif satışında KDV tahsil edilmiyor, stopaj kesilmiyor
      // ve kargo bedava veriliyordu.
      const offerPricing = await this.checkoutCommon.resolveOfferOrderPricing({
        amount: Number(offerData.amount),
        sellerId: offerData.sellerId,
        categoryId: productData.categoryId,
        shippingDesi: productData.shippingDesi,
      });
      const commissionResult = offerPricing.commission;
      const totalAmount = offerPricing.totalAmount;

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // Create order with pending_payment status (buyer adds address later via PATCH)
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: offerData.productId,
          buyerId: offerData.buyerId,
          sellerId: offerData.sellerId,
          offerId: offerId,
          totalAmount,
          subtotal: Number(offerData.amount),
          unitPrice: Number(offerData.amount),
          shippingCost: offerPricing.buyerShippingAmount,
          buyerShippingAmount: offerPricing.buyerShippingAmount,
          sellerShippingAmount: offerPricing.sellerShippingAmount,
          taxAmount: offerPricing.taxAmount,
          withholdingTaxAmount: offerPricing.withholdingTaxAmount,
          // Hizmet KDV'si `totalAmount` içinde tahsil ediliyordu ama kolonlara
          // yazılmadığı için teklif siparişlerinde 0 görünüyordu: satıcı payout'u
          // KDV'yi düşmüyor, ekranlar ve e-fatura kırılımı eksik kalıyordu.
          buyerServiceTaxAmount: offerPricing.buyerServiceTaxAmount,
          sellerServiceTaxAmount: offerPricing.sellerServiceTaxAmount,
          serviceVatRate: offerPricing.serviceVatRate,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          // v2 4-way breakdown (mirrors the direct-buy / cart paths) so the
          // granular columns + eLogo composite fee lines are correct for
          // offer-accepted orders instead of falling to @default(0).
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      this.logger.log(
        `Order ${orderNumber} created for accepted offer ${offerId} (total=${totalAmount}, commission=${commissionResult.commissionAmount}, shipping=${offerPricing.buyerShippingAmount}, tax=${offerPricing.taxAmount})`,
      );

      // Re-fetch offer with order relation so response includes orderId
      const offerWithOrder = await tx.offer.findUnique({
        where: { id: offerId },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
          buyer: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              email: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              email: true,
              avatarUrl: true,
            },
          },
          order: { select: { id: true, status: true } },
        },
      });

      return {
        offer: offerWithOrder!,
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
        buyerEmail: (result.offer.buyer as any).email || "",
        buyerName: result.offer.buyer.displayName || "Alıcı",
        sellerId: result.offer.sellerId,
        sellerName: result.offer.seller.displayName || "Satıcı",
      });
      this.logger.log(
        `offer.accepted event emitted for offer ${result.offer.id}`,
      );
    } catch (error) {
      this.logger.error(`Failed to emit offer.accepted event: ${error}`);
    }
    return await this.formatOfferResponse(result.offer);
  }

  /**
   * Reject an offer
   * POST /offers/:id/reject
   */
  async reject(offerId: string, userId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
    }

    const mustBuyerAccept = Boolean(offer.buyerMustAccept);
    if (mustBuyerAccept) {
      if (offer.buyerId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.offer.onlyBuyerCanRejectCounter"),
        );
      }
    } else if (offer.sellerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.offer.notAuthorizedToReject"),
      );
    }

    if (offer.status !== OfferStatus.pending) {
      throw new BadRequestException(
        i18nMessage("server.offer.alreadyInStatus", { status: offer.status }),
      );
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
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
      },
    });

    try {
      if (mustBuyerAccept) {
        await this.notificationService.createInAppNotification(
          rejectedOffer.sellerId,
          NotificationType.OFFER_COUNTER_DECLINED,
          {
            productId: rejectedOffer.productId,
            productTitle: rejectedOffer.product.title,
          },
        );
      } else {
        await this.notificationService.createInAppNotification(
          rejectedOffer.buyerId,
          NotificationType.OFFER_REJECTED,
          {
            productId: rejectedOffer.productId,
            productTitle: rejectedOffer.product.title,
          },
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send offer rejected notification: ${error}`);
    }

    return await this.formatOfferResponse(rejectedOffer);
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
        throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
      }

      // Only seller can counter
      if (offer.sellerId !== sellerId) {
        throw new ForbiddenException(
          i18nMessage("server.offer.notAuthorizedToCounter"),
        );
      }

      if (offer.status !== OfferStatus.pending) {
        throw new BadRequestException(
          i18nMessage("server.offer.alreadyInStatus", { status: offer.status }),
        );
      }

      if (offer.buyerMustAccept) {
        throw new BadRequestException(
          i18nMessage("server.offer.awaitingBuyerResponse"),
        );
      }

      // Check expiration
      if (new Date() > offer.expiresAt) {
        await tx.offer.update({
          where: { id: offerId },
          data: { status: OfferStatus.expired },
        });
        throw new BadRequestException(i18nMessage("server.offer.offerExpired"));
      }

      // Counter amount should be between offer and product price
      if (dto.amount <= Number(offer.amount)) {
        throw new BadRequestException(
          i18nMessage("server.offer.counterMustExceedOffer"),
        );
      }

      if (dto.amount > Number(offer.product.price)) {
        throw new BadRequestException(
          i18nMessage("server.offer.counterCannotExceedPrice"),
        );
      }

      // Reject old offer
      await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.rejected },
      });

      // Yeni kayıt: aynı alıcı/satıcı; kabul hakkı alıcıda (buyerMustAccept)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.offerExpiryHours);

      const counterOffer = await tx.offer.create({
        data: {
          productId: offer.productId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          amount: dto.amount,
          message: dto.message ?? null,
          status: OfferStatus.pending,
          buyerMustAccept: true,
          expiresAt,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
          buyer: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Alıcıya karşı teklif bildirimi (buyerCounter ile parite — eksikti)
      try {
        await this.notificationService.createInAppNotification(
          offer.buyerId,
          NotificationType.OFFER_COUNTER,
          {
            productId: offer.productId,
            productTitle: offer.product.title,
            amount: dto.amount,
          },
        );
      } catch (e) {
        this.logger.error(`counter notification: ${e}`);
      }

      return await this.formatOfferResponse(counterOffer);
    });
  }

  /**
   * Alıcı, satıcının karşı teklifine daha düşük bir tutarla yanıt verir.
   * Yeni kayıtta sıra yine satıcıda (buyerMustAccept: false) → satıcı kabul/red/karşı teklif verebilir.
   * Böylece satıcı↔alıcı karşı teklif zinciri teorik olarak sürebilir (süre dolana kadar).
   * POST /offers/:id/buyer-counter
   */
  async buyerCounter(offerId: string, buyerId: string, dto: CounterOfferDto) {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: { product: true },
      });

      if (!offer) {
        throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
      }

      if (!offer.buyerMustAccept) {
        throw new BadRequestException(
          i18nMessage("server.offer.buyerCounterOnlyAfterSellerCounter"),
        );
      }

      if (offer.buyerId !== buyerId) {
        throw new ForbiddenException(
          i18nMessage("server.offer.notAuthorizedToBuyerCounter"),
        );
      }

      if (offer.status !== OfferStatus.pending) {
        throw new BadRequestException(
          i18nMessage("server.offer.alreadyInStatus", { status: offer.status }),
        );
      }

      if (new Date() > offer.expiresAt) {
        await tx.offer.update({
          where: { id: offerId },
          data: { status: OfferStatus.expired },
        });
        throw new BadRequestException(i18nMessage("server.offer.offerExpired"));
      }

      const productPrice = Number(offer.product.price);
      const minOffer = productPrice * (this.minOfferPercentage / 100);
      const sellerCounterAmount = Number(offer.amount);

      if (dto.amount >= sellerCounterAmount) {
        throw new BadRequestException(
          i18nMessage("server.offer.buyerCounterMustBeLower"),
        );
      }

      if (dto.amount < minOffer) {
        throw new BadRequestException(
          i18nMessage("server.offer.belowMinimumBuyerCounter", {
            productPrice: productPrice.toFixed(2),
            minOffer: minOffer.toFixed(2),
            minOfferPercentage: this.minOfferPercentage,
          }),
        );
      }

      await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.rejected },
      });

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.offerExpiryHours);

      const newOffer = await tx.offer.create({
        data: {
          productId: offer.productId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          amount: dto.amount,
          message: dto.message ?? null,
          status: OfferStatus.pending,
          buyerMustAccept: false,
          expiresAt,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
          buyer: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              avatarUrl: true,
            },
          },
        },
      });

      try {
        await this.notificationService.createInAppNotification(
          offer.sellerId,
          NotificationType.OFFER_RECEIVED,
          {
            productId: offer.productId,
            productTitle: offer.product.title,
            amount: dto.amount,
          },
        );
      } catch (e) {
        this.logger.error(`buyerCounter notification: ${e}`);
      }

      return await this.formatOfferResponse(newOffer);
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
      throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
    }

    // Only buyer can cancel their own offer
    if (offer.buyerId !== buyerId) {
      throw new ForbiddenException(
        i18nMessage("server.offer.notAuthorizedToCancel"),
      );
    }

    if (offer.status !== OfferStatus.pending) {
      throw new BadRequestException(
        i18nMessage("server.offer.alreadyInStatus", { status: offer.status }),
      );
    }

    const cancelledOffer = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        status: OfferStatus.cancelled,
        cancelReason: "Alıcı tarafından iptal edildi",
        version: { increment: 1 },
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
      },
    });

    return await this.formatOfferResponse(cancelledOffer);
  }

  /**
   * Get pending offers count for badge
   */
  async getPendingCount(userId: string) {
    const [received, sent] = await Promise.all([
      this.prisma.offer.count({
        where: {
          sellerId: userId,
          status: OfferStatus.pending,
        },
      }),
      this.prisma.offer.count({
        where: {
          buyerId: userId,
          status: OfferStatus.pending,
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
    if (type === "sent") {
      where.buyerId = userId;
    } else if (type === "received") {
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
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        order: {
          select: { id: true, status: true },
        },
      },
    });

    return {
      data: await Promise.all(offers.map((o) => this.formatOfferResponse(o))),
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
            images: { take: 1, orderBy: { sortOrder: "asc" } },
            category: { select: { id: true } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        order: {
          select: { id: true, status: true },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
    }

    // Only buyer or seller can view the offer
    if (offer.buyerId !== userId && offer.sellerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.offer.notAuthorizedToView"),
      );
    }

    return await this.formatOfferResponse(offer);
  }

  /**
   * Get offers for a product (seller only)
   */
  async findProductOffers(
    productId: string,
    sellerId: string,
    query: OfferQueryDto,
  ) {
    // Verify ownership
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(i18nMessage("server.offer.productNotFound"));
    }

    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(
        i18nMessage("server.offer.notAuthorizedToViewProductOffers"),
      );
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
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: "asc" } },
            category: { select: { id: true } },
          },
        },
        buyer: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        order: {
          select: { id: true, status: true },
        },
      },
    });

    return {
      data: await Promise.all(offers.map((o) => this.formatOfferResponse(o))),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Resolve product image URL (S3 key -> presigned URL)
   */
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    if (isPublicStorageKey(imageKeyOrUrl)) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  /**
   * Format offer response with expiration info
   */
  private async formatOfferResponse(offer: any) {
    const now = new Date();
    const expiresAt = new Date(offer.expiresAt);
    const isExpired = now > expiresAt && offer.status === OfferStatus.pending;

    let timeRemaining: string | undefined;
    if (offer.status === OfferStatus.pending && !isExpired) {
      const diff = expiresAt.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      timeRemaining = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    const firstImage =
      (offer.product.images && offer.product.images[0]) || null;
    const imageUrl = this.resolveProductImageUrl(firstImage?.cardKey);

    const images =
      firstImage && firstImage.cardKey
        ? [
            {
              cardKey: firstImage.cardKey,
              detailKey: firstImage.detailKey,
              cardUrl:
                this.storageService?.getPublicAssetUrl(firstImage.cardKey) ??
                null,
              detailUrl: firstImage.detailKey
                ? (this.storageService?.getPublicAssetUrl(
                    firstImage.detailKey,
                  ) ?? null)
                : undefined,
              sortOrder: firstImage.sortOrder,
            },
          ]
        : [];

    return {
      id: offer.id,
      amount: Number(offer.amount),
      message: offer.message ?? null,
      buyerMustAccept: Boolean(offer.buyerMustAccept),
      status: isExpired ? OfferStatus.expired : offer.status,
      expiresAt: offer.expiresAt,
      isExpired,
      timeRemaining,
      orderId: offer.order?.id ?? null,
      orderStatus: offer.order?.status ?? null,
      product: {
        id: offer.product.id,
        title: offer.product.title,
        price: Number(offer.product.price),
        imageUrl: imageUrl || undefined,
        images,
        status: offer.product.status,
        categoryId:
          offer.product.categoryId ?? offer.product.category?.id ?? undefined,
      },
      buyer: offer.buyer
        ? {
            ...offer.buyer,
            avatarUrl: await this.resolveOfferAvatarUrl(offer.buyer.avatarUrl),
          }
        : offer.buyer,
      seller: offer.seller
        ? {
            ...offer.seller,
            avatarUrl: await this.resolveOfferAvatarUrl(offer.seller.avatarUrl),
          }
        : offer.seller,
      cancelReason: offer.cancelReason ?? null,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }

  private async resolveOfferAvatarUrl(
    avatarUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl(
          "avatars",
          avatarUrl,
          86400,
        );
      } catch {
        return null;
      }
    }
    return null;
  }
}
