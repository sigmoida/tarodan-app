import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { CreateOrderDto, DirectBuyDto, CheckoutDto } from "./dto";
import {
  OrderStatus,
  OfferStatus,
  ProductStatus,
  Prisma,
} from "@prisma/client";
import { getAvailableQuantity } from "../product/helpers/product-availability.helper";
import { EventService } from "../events";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { DiscountService } from "../discount";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { OrderPricingService } from "./order-pricing.service";
import { OrderCommonService } from "./order-common.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderCheckoutGroupService } from "./order-checkout-group.service";

/**
 * Grup dışı satın alma akışları: Hızlı Al (createDirectOrder), teklif→sipariş (create)
 * ve üye toplu checkout girişi (checkout, group'a delege) — OrderCheckoutService'ten
 * birebir taşındı. Sürat/vergi/komisyon primitifleri OrderCheckoutCommonService'te.
 * DI: checkoutCommon + group (checkout için) + leaf'ler; döngü yok (group'a tek yön).
 */
@Injectable()
export class OrderCheckoutDirectService {
  private readonly logger = new Logger(OrderCheckoutDirectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    private readonly discountService: DiscountService,
    private readonly suratCargoService: SuratCargoService,
    private readonly orderPricing: OrderPricingService,
    private readonly orderCommon: OrderCommonService,
    private readonly checkoutCommon: OrderCheckoutCommonService,
    private readonly group: OrderCheckoutGroupService,
  ) {}

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

    // 409 PRICING_CHANGED: shipping tariff moved since the quote was built.
    await this.orderPricing.assertShippingTariffUnchanged(
      dto.expectedShippingTariffVersion,
    );

    // Validate DTO has necessary address info
    if (!dto.shippingAddressId && !dto.shippingAddress) {
      this.logger.error("[createDirectOrder] No shipping address provided");
      throw new BadRequestException(
        i18nMessage("server.order.shippingAddressRequiredWithFields"),
      );
    }

    // Check if user is banned
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
      select: { isBanned: true },
    });

    if (buyer?.isBanned) {
      throw new ForbiddenException(i18nMessage("server.order.accountBanned"));
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM products p
        WHERE p.id = ${dto.productId}
        FOR UPDATE
      `;
      if (!lockedRows?.length) {
        throw new NotFoundException(
          i18nMessage("server.order.productNotFound"),
        );
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
        throw new NotFoundException(
          i18nMessage("server.order.productNotFound"),
        );
      }

      // Aynı alıcının bu ürün için bekleyen (ödeme yapılmamış) siparişi varsa onu döndür, yeni sipariş açma
      const existingOrder = await tx.order.findFirst({
        where: {
          productId: dto.productId,
          buyerId,
          status: OrderStatus.pending_payment,
        },
        orderBy: { createdAt: "desc" },
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
          appliedCouponCode:
            (existingOrder.discountCode as string) ?? undefined,
          productId: dto.productId,
          paymentUrl: "",
          provider: "paytr",
          existingOrder: true,
        };
      }

      // Ürün satışta değilse (sold, inactive vb.) hata ver
      if (product.status !== ProductStatus.active) {
        throw new BadRequestException(
          i18nMessage("server.order.productNotActive"),
        );
      }

      // Adet bazlı stok kontrolü: müsait adet >= 1 olmalı
      const available = getAvailableQuantity(product);
      if (available !== null && available < 1) {
        throw new BadRequestException(
          i18nMessage("server.order.productOutOfStock"),
        );
      }

      // Cannot buy own product
      if (product.sellerId === buyerId) {
        throw new ForbiddenException(
          i18nMessage("server.order.cannotBuyOwnProduct"),
        );
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
          throw new BadRequestException(
            i18nMessage("server.order.invalidShippingAddress"),
          );
        }
        shippingAddress = savedAddress;
        shippingAddressId = savedAddress.id;
      } else if (dto.shippingAddress) {
        // Validate required fields
        if (!dto.shippingAddress.fullName?.trim()) {
          throw new BadRequestException(
            i18nMessage("server.order.shippingAddressNameRequired"),
          );
        }
        if (!dto.shippingAddress.phone?.trim()) {
          throw new BadRequestException(
            i18nMessage("server.order.shippingAddressPhoneRequired"),
          );
        }
        if (!dto.shippingAddress.city?.trim()) {
          throw new BadRequestException(
            i18nMessage("server.order.shippingAddressCityRequired"),
          );
        }
        if (!dto.shippingAddress.district?.trim()) {
          throw new BadRequestException(
            i18nMessage("server.order.shippingAddressDistrictRequired"),
          );
        }
        if (!dto.shippingAddress.address?.trim()) {
          throw new BadRequestException(
            i18nMessage("server.order.shippingAddressLineRequired"),
          );
        }

        // Use inline address object - create a new address for the user
        const newAddress = await tx.address.create({
          data: {
            userId: buyerId,
            title: "Sipariş Adresi",
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
        throw new BadRequestException(
          i18nMessage("server.order.shippingAddressRequired"),
        );
      }

      // Resolve billing address: inline object > saved address ID > same as shipping
      let billingAddress = shippingAddress;
      if (
        dto.billingAddress &&
        dto.billingAddress.fullName?.trim() &&
        dto.billingAddress.city?.trim() &&
        dto.billingAddress.address?.trim()
      ) {
        // Inline billing address (no need to save in profile)
        billingAddress = {
          id: "",
          title: "Fatura Adresi",
          fullName: dto.billingAddress.fullName.trim(),
          phone: (
            dto.billingAddress.phone ||
            shippingAddress.phone ||
            ""
          ).trim(),
          city: dto.billingAddress.city.trim(),
          district: (dto.billingAddress.district || "").trim(),
          address: dto.billingAddress.address.trim(),
          zipCode: dto.billingAddress.zipCode?.trim() || null,
        };
      } else if (
        dto.billingAddressId &&
        dto.billingAddressId !== shippingAddressId
      ) {
        const billing = await tx.address.findUnique({
          where: { id: dto.billingAddressId },
        });
        if (!billing || billing.userId !== buyerId) {
          throw new BadRequestException(
            i18nMessage("server.order.invalidBillingAddress"),
          );
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
      const originalPrice =
        isSaleActive && product.oldPrice != null
          ? Number(product.oldPrice)
          : productPrice;
      const productDiscount = isSaleActive ? originalPrice - productPrice : 0;

      // Apply coupon discount if provided
      let couponDiscount = 0;
      let appliedCouponCode: string | null = null;
      let appliedDiscountId: string | null = null;
      let appliedVoucherCodeId: string | undefined;

      if (dto.couponCode) {
        const validation = await this.discountService.validateCoupon(
          {
            code: dto.couponCode,
            cartItems: [{ productId: dto.productId, quantity: 1 }],
          },
          buyerId,
        );

        if (validation.isValid && validation.discount) {
          couponDiscount = validation.discount.estimatedDiscount;
          appliedCouponCode = dto.couponCode.toUpperCase();
          appliedDiscountId = validation.discount.id;
          appliedVoucherCodeId = validation.discount.voucherCodeId;
        } else if (!validation.isValid) {
          throw new BadRequestException(
            validation.error || i18nMessage("server.order.invalidCouponCode"),
          );
        }
      }

      // Calculate total discount and subtotal
      const totalDiscount = productDiscount + couponDiscount;
      const subtotal = originalPrice;
      // Negatif-koruma: couponDiscount validateCoupon'da eligible-subtotal (= ürün
      // fiyatı) ile capli, yine de floor ile discountedPrice asla negatif olmaz.
      const discountedPrice = Math.max(0, productPrice - couponDiscount);

      // Calculate commission with category-based matching (3.3)
      // Commission is calculated on discounted product price, not including shipping
      const commissionResult = await this.orderPricing.calculateCommission(
        discountedPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Calculate shipping cost (free shipping for orders >= 500 TL)
      const fullShipping =
        await this.orderPricing.calculateShippingCost(discountedPrice);
      // Kargo payı: tek kargo tutarı alıcı/satıcı arasında bölünür (kurala göre).
      // buyerShare=100 → alıcı tümünü öder (mevcut davranış). Alıcı yalnız kendi
      // payını öder; kalanı satıcı üstlenir (payout formülü değişmeden buyerShipping
      // satıcıya akar; satıcı kargoyu öderken sellerShipping kadarını absorbe eder).
      const buyerShippingAmount =
        Math.round(
          fullShipping * (commissionResult.shippingBuyerShare / 100) * 100,
        ) / 100;
      const sellerShippingAmount =
        Math.round((fullShipping - buyerShippingAmount) * 100) / 100;
      const shippingCost = buyerShippingAmount; // buyer-charged shipping
      const tariffMeta = await this.orderPricing.getShippingTariffMeta();
      // KDV + stopaj: kurumsal satıcı ise ürün fiyatı üzerinden
      const { taxAmount, withholdingTaxAmount } =
        await this.checkoutCommon.resolveSellerTaxes(
          product.sellerId,
          product.categoryId,
          discountedPrice,
        );
      // Buyer fee + KDV eklenir (stopaj alıcı tutarını etkilemez; satıcı payout'undan kesilir)
      const totalAmount =
        discountedPrice +
        shippingCost +
        commissionResult.buyerFeeAmount +
        taxAmount;

      // Generate order number
      const orderNumber = await this.checkoutCommon.generateOrderNumber();

      const suratIdempotencyKey =
        dto.idempotencyKey?.trim() ||
        this.checkoutCommon.buildSuratIdempotencyKey([
          buyerId,
          dto.productId,
          String(shippingAddressId || ""),
          dto.shippingAddress
            ? `${dto.shippingAddress.city}|${dto.shippingAddress.phone}|${dto.shippingAddress.address}`
            : "",
          dto.couponCode || "",
        ]);

      // Adet bazlı rezervasyon: 1 adet rezerve et (stok ödeme tamamlanınca düşer)
      // Invalidation yapılmıyor — cron halledecek (stock_plan.md)
      await tx.product.update({
        where: { id: dto.productId },
        data: { reservedQuantity: { increment: 1 } },
      });

      // Build shippingAddress JSON; add billing snapshot when different from shipping
      const shippingAddressJson: Record<string, unknown> = {
        id: shippingAddress.id,
        title: shippingAddress.title || "Teslimat Adresi",
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

      // Faz 1: tek order da satıcı-paketi (çatı) altında — model tüm yollarda uniform
      // (Faz 2 Shipment.packageId + Faz 3 UI gruplaması her order'ın paketi olduğunu varsayar).
      const singleOrderPackage = await tx.orderPackage.create({
        data: {
          checkoutGroupId: singleOrderGroup.id,
          sellerId: product.sellerId,
          buyerId,
          shippingCost,
          shippingTariffId: tariffMeta.tariffId,
          shippingTariffVersion: tariffMeta.tariffVersion,
          fullShippingAmount: fullShipping,
          buyerShippingAmount,
          sellerShippingAmount,
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
          packageId: singleOrderPackage.id,
          totalAmount,
          subtotal,
          discountAmount: totalDiscount,
          discountCode: appliedCouponCode,
          discountBreakdown:
            totalDiscount > 0
              ? {
                  productDiscount,
                  couponDiscount,
                  appliedDiscountId,
                  originalPrice,
                }
              : undefined,
          shippingCost,
          taxAmount,
          withholdingTaxAmount,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          buyerShippingAmount,
          sellerShippingAmount,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddressId: shippingAddressId,
          shippingAddress: shippingAddressJson as Prisma.InputJsonValue,
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
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
      await this.checkoutCommon.recordCommissionSnapshot(
        order.id,
        orderNumber,
        commissionResult.commissionAmount,
        totalAmount,
        commissionResult,
      );

      // Record discount usage if a coupon was applied. Pass the outer tx so it is
      // ATOMIC with order creation (F4.4) — a rolled-back checkout no longer leaves
      // the coupon phantom-consumed.
      if (appliedDiscountId && couponDiscount > 0) {
        await this.discountService.recordUsage(
          appliedDiscountId,
          buyerId,
          order.id,
          couponDiscount,
          appliedVoucherCodeId,
          tx,
        );
        this.logger.log(
          `Discount usage recorded: ${appliedDiscountId} for order ${orderNumber}`,
        );
      }

      // Emit order.created event (outside transaction but still in the method)
      // This sends notification emails and push notifications
      try {
        const createdOrder = order as typeof order & {
          product: { title: string };
          buyer: { email: string; displayName: string | null };
          seller: { email: string | null; displayName: string | null };
        };
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
          sellerEmail: createdOrder.seller.email || "",
          sellerName: createdOrder.seller.displayName || "Satıcı",
        });
        this.logger.log(
          `order.created event emitted for order ${createdOrder.orderNumber}`,
        );
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
        paymentUrl: "",
        provider: "paytr",
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
      throw new ForbiddenException(i18nMessage("server.order.accountBanned"));
    }
    // 409 PRICING_CHANGED: shipping tariff moved since the quote was built.
    await this.orderPricing.assertShippingTariffUnchanged(
      dto.expectedShippingTariffVersion,
    );

    return this.group.createCheckoutGroup({ buyerId, dto, isGuest: false });
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
      throw new ForbiddenException(i18nMessage("server.order.accountBanned"));
    }
    let productIdForCache: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      // Get and validate offer
      const offer = await tx.offer.findUnique({
        where: { id: dto.offerId },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      });

      if (!offer) {
        throw new NotFoundException(i18nMessage("server.order.offerNotFound"));
      }

      // Only buyer can create order
      if (offer.buyerId !== buyerId) {
        throw new ForbiddenException(
          i18nMessage("server.order.offerOrderForbidden"),
        );
      }

      // Offer must be accepted
      if (offer.status !== OfferStatus.accepted) {
        throw new BadRequestException(
          i18nMessage("server.order.offerNotAccepted"),
        );
      }

      // Check if order already exists for this offer
      const existingOrder = await tx.order.findFirst({
        where: { offerId: dto.offerId },
      });

      if (existingOrder) {
        throw new BadRequestException(
          i18nMessage("server.order.offerAlreadyHasOrder"),
        );
      }

      // Validate shipping address belongs to buyer
      const shippingAddress = await tx.address.findUnique({
        where: { id: dto.shippingAddressId },
      });

      if (!shippingAddress || shippingAddress.userId !== buyerId) {
        throw new BadRequestException(
          i18nMessage("server.order.invalidShippingAddress"),
        );
      }

      // Validate billing address if provided
      const billingAddressId = dto.billingAddressId || dto.shippingAddressId;
      if (dto.billingAddressId) {
        const billingAddress = await tx.address.findUnique({
          where: { id: dto.billingAddressId },
        });

        if (!billingAddress || billingAddress.userId !== buyerId) {
          throw new BadRequestException(
            i18nMessage("server.order.invalidBillingAddress"),
          );
        }
      }

      // Calculate commission with category-based matching (3.3)
      const commissionResult = await this.orderPricing.calculateCommission(
        Number(offer.amount),
        offer.sellerId,
        offer.product.categoryId, // Pass categoryId for priority-based matching
      );

      // Generate order number
      const orderNumber = await this.checkoutCommon.generateOrderNumber();

      const suratIdempotencyKeyOffer =
        dto.idempotencyKey?.trim() ||
        this.checkoutCommon.buildSuratIdempotencyKey([
          buyerId,
          dto.offerId,
          dto.shippingAddressId,
        ]);

      // KDV + stopaj: kurumsal satıcı ise ürün fiyatı üzerinden
      const {
        taxAmount: offerTaxAmount,
        withholdingTaxAmount: offerWithholdingAmount,
      } = await this.checkoutCommon.resolveSellerTaxes(
        offer.sellerId,
        offer.product.categoryId,
        Number(offer.amount),
      );
      // Buyer fee + KDV eklenir (stopaj satıcı payout'undan kesilir)
      const totalAmount =
        Number(offer.amount) + commissionResult.buyerFeeAmount + offerTaxAmount;

      const offerShippingJson: Record<string, unknown> | undefined =
        shippingAddress
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

      // Faz 1: teklif siparişi de satıcı-paketi altında (uniform model). Teklif yolunda
      // ayrı kargo ücreti yok → shippingCost 0.
      const offerOrderPackage = await tx.orderPackage.create({
        data: {
          checkoutGroupId: offerOrderGroup.id,
          sellerId: offer.sellerId,
          buyerId,
          shippingCost: 0,
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
          packageId: offerOrderPackage.id,
          totalAmount,
          taxAmount: offerTaxAmount,
          withholdingTaxAmount: offerWithholdingAmount,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          buyerShippingAmount: 0,
          sellerShippingAmount: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddressId: dto.shippingAddressId,
          shippingAddress: offerShippingJson as
            Prisma.InputJsonValue | undefined,
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

      // Record commission snapshot for analytics (3.3)
      await this.checkoutCommon.recordCommissionSnapshot(
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
      await this.sendProductSoldNotifications(
        productIdForCache,
        result.seller?.id,
      );
    }

    return result;
  }

  /**
   * Send notifications when product is sold
   */
  private async sendProductSoldNotifications(
    productId: string,
    sellerId?: string,
  ): Promise<void> {
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
      this.logger.error("Failed to send product sold notifications:", error);
    }
  }
}
