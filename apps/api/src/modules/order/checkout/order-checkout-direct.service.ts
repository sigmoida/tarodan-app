import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { buyerTotalOf } from "../helpers/order-total.helper";
import { chargedProductBaseOf } from "../helpers/order-charged-base.helper";
import { paymentWindowEnd } from "../../payment/helpers/payment.constants";
import { resolveSalePrice } from "../../product/helpers/product-sale-window";
import { i18nMessage } from "../../i18n";
import { CreateOrderDto, DirectBuyDto, CheckoutDto } from "../dto";
import {
  OrderStatus,
  OfferStatus,
  ProductKind,
  ProductStatus,
  Prisma,
} from "@prisma/client";
import { getAvailableQuantity } from "../../product/helpers/product-availability.helper";
import { EventService } from "../../events";
import { DiscountService } from "../../discount";
import { SuratCargoService } from "../../surat-cargo/surat-cargo.service";
import { OrderPricingService } from "../pricing/order-pricing.service";
import { OrderCommonService } from "../order-common.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderFeeDiscountService } from "../pricing/order-fee-discount.service";
import type { FeeDiscountCandidate } from "../../discount/fee-discount.engine";
import {
  allocateCouponAcrossLines,
  remainingDiscountAllowanceFor,
} from "../../discount/fee-discount.engine";
import { splitShippingByBuyerShare } from "../../shipping/shipping-tariff.helper";
import { OrderCheckoutGroupService } from "./order-checkout-group.service";
import {
  REFERENCE_PREFIX,
  reprefixReference,
} from "../../../common/helpers/code-prefixes";
import {
  PUBLIC_NAME_SELECT,
  PublicIdentityInput,
  publicName,
} from "../../../common/helpers/public-identity";

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
    private readonly discountService: DiscountService,
    private readonly suratCargoService: SuratCargoService,
    private readonly orderPricing: OrderPricingService,
    private readonly orderCommon: OrderCommonService,
    private readonly checkoutCommon: OrderCheckoutCommonService,
    private readonly group: OrderCheckoutGroupService,
    @Optional()
    private readonly feeDiscounts?: OrderFeeDiscountService,
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
    this.logger.log(
      `[createDirectOrder] Starting order for buyer=${buyerId} product=${dto.productId}`,
    );

    const shippingTariff =
      await this.orderPricing.resolveShippingTariffSnapshot(
        dto.expectedShippingTariffVersion,
        true,
      );
    const commissionRuleSet =
      await this.orderPricing.resolveCommissionRuleSetSnapshot(
        dto.expectedCommissionRuleSetId,
        dto.expectedCommissionRuleSetVersion,
        true,
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
            select: { id: true, ...PUBLIC_NAME_SELECT },
          },
        },
      });

      if (!product) {
        throw new NotFoundException(
          i18nMessage("server.order.productNotFound"),
        );
      }

      if (product.kind !== ProductKind.listing) {
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
        include: {
          package: { select: { shippingTariffVersion: true } },
        },
      });
      if (existingOrder) {
        if (
          existingOrder.package?.shippingTariffVersion !==
          shippingTariff.tariffVersion
        ) {
          throw new ConflictException(
            i18nMessage("server.shipping.pricingChanged"),
          );
        }
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

      // İndirim penceresi ORTAK kuraldan: pencere dışındaysa satış fiyatı
      // indirim öncesi fiyattır — vitrin, sepet ve tahsilat aynı sayıyı görür.
      const now = new Date();
      const sale = resolveSalePrice(product, now);
      const basePrice = sale.price;
      // F1.4: charged base = efektif (kampanya) fiyat — ürün kartı/sepet ile aynı; kupon
      // yine baz üzerinden. Aktif code=null kampanya yoksa efektif == baz (no-op).
      const campaignPrice = await this.discountService.getEffectiveDisplayPrice(
        product.id,
        product.sellerId,
        product.categoryId ?? "",
        basePrice,
      );
      const productPrice = campaignPrice ?? basePrice;
      const originalPrice = sale.oldPrice ?? basePrice;
      const productDiscount = Math.max(0, originalPrice - productPrice);

      // F1.3: quote'un birim-fiyat hash'i ile doğrula — fiyat/kampanya değiştiyse
      // 409 PRICING_CHANGED (sessiz farklı tahsil yok). Hash yoksa atlanır.
      this.orderPricing.assertPricingUnchanged(dto.expectedPricingHash, [
        {
          productId: dto.productId,
          unitPrice: productPrice,
          quantity: 1,
          shippingDesi: product.shippingDesi,
        },
      ]);

      // Apply coupon discount if provided
      let couponDiscount = 0;
      let appliedCouponCode: string | null = null;
      let appliedDiscountId: string | null = null;
      let appliedVoucherCodeId: string | undefined;
      // F2.4: kupon indiriminin platform payı [0,1].
      let couponPlatformFundedShare = 0;

      let couponFeeCandidate: FeeDiscountCandidate | null = null;
      if (dto.couponCode) {
        const validation = await this.discountService.validateCoupon(
          {
            code: dto.couponCode,
            cartItems: [{ productId: dto.productId, quantity: 1 }],
          },
          buyerId,
        );

        if (validation.isValid && validation.discount) {
          // %50 tavan TEK kaynaktan (quote/grup ile birebir): tek satırlık
          // siparişte kupon, ürün tabanının yarısını aşamaz.
          couponDiscount = allocateCouponAcrossLines(
            [productPrice],
            validation.discount.estimatedDiscount,
          ).total;
          appliedCouponCode = dto.couponCode.toUpperCase();
          appliedDiscountId = validation.discount.id;
          appliedVoucherCodeId = validation.discount.voucherCodeId;
          couponPlatformFundedShare = validation.discount.platformFundedShare;
          // Bedel hedefli kupon ürün tabanına dokunmaz; motora aday geçer.
          couponFeeCandidate =
            this.feeDiscounts?.couponCandidate(validation.discount) ?? null;
        } else if (!validation.isValid) {
          throw new BadRequestException(
            validation.error || i18nMessage("server.order.invalidCouponCode"),
          );
        }
      }

      const totalDiscount = productDiscount + couponDiscount;
      // Siparişin ürün tabanı = TAHSİL EDİLEN tutar; komisyon, kargo, vergi ve
      // alıcı toplamı hep bunun üzerinden. İndirim öncesi liste fiyatı
      // `discountAmount` / `discountBreakdown` / snapshot'ta durur.
      const discountedPrice = chargedProductBaseOf({
        unitPrice: productPrice,
        couponDiscount,
      });
      const subtotal = discountedPrice;
      const pinnedRuleSetId = commissionRuleSet.id;

      // Calculate commission with category-based matching (3.3)
      // Commission is calculated on discounted product price, not including shipping
      const rawCommissionResult = await this.orderPricing.calculateCommission(
        discountedPrice,
        product.sellerId,
        product.categoryId,
        pinnedRuleSetId,
        discountedPrice,
        product.id,
      );

      // Kargo kararı (quote ile ORTAK): paket desisi → kademe → o kademenin payı →
      // alıcı/satıcı bölüşümü. Alıcı yalnız kendi payını öder; kalanı satıcı üstlenir.
      const {
        fullShipping,
        buyer: rawBuyerShippingAmount,
        seller: rawSellerShippingAmount,
      } = this.orderPricing.resolveShippingDecision({
        tariff: shippingTariff.tariff,
        subtotal: discountedPrice,
        billableDesi: product.shippingDesi,
        lineShares: [rawCommissionResult.shippingBuyerShares],
        // Ücretsiz kargo eşiği kupon ÖNCESİ fiyattan denetlenir (İ14).
        thresholdSubtotal: productPrice,
      });

      // Platformun bedel kampanyaları: KDV'den ÖNCE uygulanır (bedel inince
      // matrahı da iner) ve kesinti kalemlerinin kendisine yazılır.
      const feeDiscounted = (await this.feeDiscounts?.apply({
        context: {
          productId: product.id,
          categoryId: product.categoryId,
          sellerId: product.sellerId,
          buyerId,
        },
        commission: rawCommissionResult,
        buyerShippingAmount: rawBuyerShippingAmount,
        sellerShippingAmount: rawSellerShippingAmount,
        remainingAllowance: remainingDiscountAllowanceFor({
          lineBase: productPrice,
          couponDiscount,
        }),
        couponCandidates: couponFeeCandidate ? [couponFeeCandidate] : [],
      })) ?? {
        commission: rawCommissionResult,
        buyerShippingAmount: rawBuyerShippingAmount,
        sellerShippingAmount: rawSellerShippingAmount,
        applied: [],
        buyerTotal: 0,
        sellerTotal: 0,
      };
      const commissionResult = feeDiscounted.commission;
      const buyerShippingAmount = feeDiscounted.buyerShippingAmount;
      const sellerShippingAmount = feeDiscounted.sellerShippingAmount;
      const shippingCost = buyerShippingAmount; // buyer-charged shipping
      // Vergiler: ürün KDV'si (politikayla kapalı), hizmet KDV'si (iki taraf) ve stopaj.
      const {
        taxAmount,
        withholdingTaxAmount,
        buyerServiceTaxAmount,
        sellerServiceTaxAmount,
        serviceVatRate,
      } = await this.checkoutCommon.resolveOrderTaxes({
        sellerId: product.sellerId,
        categoryId: product.categoryId,
        subtotal: discountedPrice,
        fees: {
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          buyerShippingAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          sellerShippingAmount,
        },
      });
      // Alıcı ücretleri + ürün KDV'si + alıcıya verilen hizmetlerin KDV'si eklenir.
      // (Stopaj ve satıcı hizmet KDV'si alıcı tutarını etkilemez — payout'tan kesilir.)
      const totalAmount = buyerTotalOf({
        subtotal: discountedPrice,
        buyerShippingAmount: shippingCost,
        buyerFeeAmount: commissionResult.buyerFeeAmount,
        buyerServiceTaxAmount,
      });

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
          groupNumber: reprefixReference(
            orderNumber,
            REFERENCE_PREFIX.checkoutGroup,
          ),
          buyerId,
          totalAmount,
          isGuest: false,
        },
      });

      // Faz 1: tek order da satıcı-paketi (çatı) altında — model tüm yollarda uniform
      // (Faz 2 Shipment.packageId + Faz 3 UI gruplaması her order'ın paketi olduğunu varsayar).
      const singleOrderPackage = await tx.orderPackage.create({
        data: {
          packageNumber: await this.checkoutCommon.generatePackageNumber(),
          checkoutGroupId: singleOrderGroup.id,
          sellerId: product.sellerId,
          buyerId,
          shippingCost,
          shippingTariffId: shippingTariff.tariffId,
          shippingTariffVersion: shippingTariff.tariffVersion,
          billableDesi: product.shippingDesi,
          shippingPricingSnapshot: {
            provider: shippingTariff.tariff.provider ?? "surat",
            tariffId: shippingTariff.tariffId,
            tariffVersion: shippingTariff.tariffVersion,
            billableDesi: product.shippingDesi,
            fullShippingAmount: fullShipping,
          },
          fullShippingAmount: fullShipping,
          buyerShippingAmount,
          sellerShippingAmount,
        },
      });
      const paymentExpiresAt = paymentWindowEnd();

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
          platformFundedDiscount:
            Math.round(couponDiscount * couponPlatformFundedShare * 100) / 100,
          shippingCost,
          taxAmount,
          withholdingTaxAmount,
          buyerServiceTaxAmount,
          sellerServiceTaxAmount,
          serviceVatRate,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          buyerShippingAmount,
          sellerShippingAmount,
          buyerFeeDiscountAmount: feeDiscounted.buyerTotal,
          sellerFeeDiscountAmount: feeDiscounted.sellerTotal,
          feeDiscountBreakdown: feeDiscounted.applied.length
            ? (feeDiscounted.applied as unknown as Prisma.InputJsonValue)
            : undefined,
          financialSnapshot: this.checkoutCommon.buildFinancialSnapshot({
            pricingHash: dto.expectedPricingHash,
            productId: dto.productId,
            quantity: 1,
            unitPrice: productPrice,
            originalUnitPrice: originalPrice,
            subtotal,
            discountAmount: totalDiscount,
            discountCode: appliedCouponCode,
            platformFundedDiscount:
              Math.round(couponDiscount * couponPlatformFundedShare * 100) /
              100,
            shipping: {
              tariffId: shippingTariff.tariffId,
              tariffVersion: shippingTariff.tariffVersion,
              fullAmount: fullShipping,
              buyerAmount: buyerShippingAmount,
              sellerAmount: sellerShippingAmount,
            },
            commission: commissionResult,
            taxAmount,
            withholdingTaxAmount,
            buyerServiceTaxAmount,
            sellerServiceTaxAmount,
            totalAmount,
          }),
          status: OrderStatus.pending_payment,
          paymentExpiresAt,
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
            select: { id: true, email: true, ...PUBLIC_NAME_SELECT },
          },
          seller: {
            select: { id: true, email: true, ...PUBLIC_NAME_SELECT },
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

      // Kodsuz (otomatik) kampanyaların bütçesi sipariş oluşurken harcanır;
      // ödenmeyen sipariş kapanırken releaseReservedUsageForOrders geri verir.
      await this.feeDiscounts?.spendBudgets(feeDiscounted.applied, tx);

      // Hold coupon capacity while payment is pending. This does NOT increment
      // usedCount or create DiscountUsage; successful payment converts it to real
      // usage atomically in PaymentFulfillmentService.
      // Bedel hedefli kuponda ürün tabanı düşmez; kotayı ve bütçeyi tutan tutar,
      // bedellerden verilen indirimdir.
      const reservedCouponAmount = couponFeeCandidate
        ? feeDiscounted.applied
            .filter((line) => line.discountId === appliedDiscountId)
            .reduce((sum, line) => sum + line.amount, 0)
        : couponDiscount;
      if (appliedDiscountId && reservedCouponAmount > 0) {
        await this.discountService.reserveUsage(
          appliedDiscountId,
          buyerId,
          order.id,
          reservedCouponAmount,
          appliedVoucherCodeId,
          paymentExpiresAt,
          tx,
        );
        this.logger.log(
          `Discount reserved: ${appliedDiscountId} for order ${orderNumber}`,
        );
      }

      // Emit order.created event (outside transaction but still in the method)
      // This sends notification emails and push notifications
      try {
        const createdOrder = order as typeof order & {
          product: { title: string };
          buyer: { email: string } & PublicIdentityInput;
          seller: { email: string | null } & PublicIdentityInput;
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
          buyerName: publicName(createdOrder.buyer),
          sellerEmail: createdOrder.seller.email || "",
          sellerName: publicName(createdOrder.seller),
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
    const shippingTariff =
      await this.orderPricing.resolveShippingTariffSnapshot();
    const commissionRuleSet =
      await this.orderPricing.resolveCommissionRuleSetSnapshot();
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

      if (offer.product.kind !== ProductKind.listing) {
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

      // Bedeller teklif kabul yoluyla AYNI primitiften gelir (tek kaynak): komisyon,
      // kargo payı, KDV, stopaj ve tahsil edilecek toplam.
      const offerPricing = await this.checkoutCommon.resolveOfferOrderPricing({
        amount: Number(offer.amount),
        productId: offer.product.id,
        sellerId: offer.sellerId,
        categoryId: offer.product.categoryId,
        shippingDesi: offer.product.shippingDesi,
        shippingTariff: shippingTariff.tariff,
        commissionRuleSetId: commissionRuleSet.id,
      });
      const commissionResult = offerPricing.commission;
      const offerFullShipping = offerPricing.fullShippingAmount;
      const offerBuyerShippingAmount = offerPricing.buyerShippingAmount;
      const offerSellerShippingAmount = offerPricing.sellerShippingAmount;

      // Generate order number
      const orderNumber = await this.checkoutCommon.generateOrderNumber();

      const suratIdempotencyKeyOffer =
        dto.idempotencyKey?.trim() ||
        this.checkoutCommon.buildSuratIdempotencyKey([
          buyerId,
          dto.offerId,
          dto.shippingAddressId,
        ]);

      const offerTaxAmount = offerPricing.taxAmount;
      const offerWithholdingAmount = offerPricing.withholdingTaxAmount;
      const totalAmount = offerPricing.totalAmount;
      const offerPricingHash = this.orderPricing.computePricingHash([
        {
          productId: offer.productId,
          unitPrice: Number(offer.amount),
          quantity: 1,
          shippingDesi: offer.product.shippingDesi,
        },
      ]);

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
          groupNumber: reprefixReference(
            orderNumber,
            REFERENCE_PREFIX.checkoutGroup,
          ),
          buyerId,
          totalAmount,
          isGuest: false,
        },
      });

      // Teklif siparişi de normal satışla aynı sürümlü kargo tarifesini kullanır.
      const offerOrderPackage = await tx.orderPackage.create({
        data: {
          packageNumber: await this.checkoutCommon.generatePackageNumber(),
          checkoutGroupId: offerOrderGroup.id,
          sellerId: offer.sellerId,
          buyerId,
          shippingCost: offerBuyerShippingAmount,
          shippingTariffId: shippingTariff.tariffId,
          shippingTariffVersion: shippingTariff.tariffVersion,
          billableDesi: offer.product.shippingDesi,
          shippingPricingSnapshot: {
            provider: shippingTariff.tariff.provider ?? "surat",
            tariffId: shippingTariff.tariffId,
            tariffVersion: shippingTariff.tariffVersion,
            billableDesi: offer.product.shippingDesi,
            fullShippingAmount: offerFullShipping,
          },
          fullShippingAmount: offerFullShipping,
          buyerShippingAmount: offerBuyerShippingAmount,
          sellerShippingAmount: offerSellerShippingAmount,
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
          subtotal: offer.amount,
          unitPrice: offer.amount,
          shippingCost: offerBuyerShippingAmount,
          taxAmount: offerTaxAmount,
          withholdingTaxAmount: offerWithholdingAmount,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          buyerShippingAmount: offerBuyerShippingAmount,
          sellerShippingAmount: offerSellerShippingAmount,
          // Bedel indirimleri kesinti kolonlarına zaten işlenmiş durumda; bu üç
          // alan rapor, iade denetimi ve bütçe iadesi içindir (teklif kabul
          // yolundaki create ile aynı — eksikti).
          buyerFeeDiscountAmount: offerPricing.buyerFeeDiscountAmount ?? 0,
          sellerFeeDiscountAmount: offerPricing.sellerFeeDiscountAmount ?? 0,
          feeDiscountBreakdown: offerPricing.feeDiscounts?.length
            ? (offerPricing.feeDiscounts as unknown as Prisma.InputJsonValue)
            : undefined,
          financialSnapshot: this.checkoutCommon.buildFinancialSnapshot({
            pricingHash: offerPricingHash,
            productId: offer.productId,
            quantity: 1,
            unitPrice: Number(offer.amount),
            originalUnitPrice: Number(offer.amount),
            subtotal: Number(offer.amount),
            discountAmount: 0,
            platformFundedDiscount: 0,
            shipping: {
              tariffId: shippingTariff.tariffId,
              tariffVersion: shippingTariff.tariffVersion,
              fullAmount: offerFullShipping,
              buyerAmount: offerBuyerShippingAmount,
              sellerAmount: offerSellerShippingAmount,
            },
            commission: commissionResult,
            taxAmount: offerTaxAmount,
            withholdingTaxAmount: offerWithholdingAmount,
            totalAmount,
          }),
          status: OrderStatus.pending_payment,
          paymentExpiresAt: paymentWindowEnd(),
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
              ...PUBLIC_NAME_SELECT,
              isVerified: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              ...PUBLIC_NAME_SELECT,
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

      // Kodsuz kampanyaların bütçesi sipariş oluşurken harcanır.
      await this.feeDiscounts?.spendBudgets(
        offerPricing.feeDiscounts ?? null,
        tx,
      );

      // Rezervasyon teklif kabul edildiğinde (offer.service accept) yapıldı; burada tekrar yapmıyoruz.

      // Store productId for cache invalidation
      productIdForCache = offer.productId;

      return await this.orderCommon.formatOrderResponse(order, buyerId);
    });

    // Invalidate product cache after successful transaction
    if (productIdForCache) {
      await this.orderCommon.invalidateProductCaches(productIdForCache);
    }

    // NOT: WISHLIST_SOLD burada GÖNDERİLMEZ. Bu akış siparişi pending_payment
    // ile oluşturur; ödeme hiç tamamlanmayabilir. "Satıldı" haberi ödeme
    // başarıyla sonuçlanınca PaymentFulfillmentService'ten (post-commit) çıkar.

    return result;
  }
}
