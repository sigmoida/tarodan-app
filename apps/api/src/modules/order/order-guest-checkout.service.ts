import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { CacheService } from "../cache/cache.service";
import {
  GuestCheckoutDto,
  GuestSendVerificationCodeDto,
  GuestCheckoutGroupDto,
} from "./dto";
import {
  OrderStatus,
  OfferStatus,
  ProductStatus,
  Prisma,
} from "@prisma/client";
import { getAvailableQuantity } from "../product/helpers/product-availability.helper";
import { NotificationService } from "../notification/notification.service";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { OrderPricingService } from "./order-pricing.service";
import { OrderCommonService } from "./order-common.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { splitShippingByBuyerShare } from "../shipping/shipping-tariff.helper";
import { OrderCheckoutGroupService } from "./order-checkout-group.service";
import {
  REFERENCE_PREFIX,
  reprefixReference,
} from "../../common/helpers/code-prefixes";

/**
 * Misafir checkout + e-posta OTP alt sistemi: sendGuestCheckoutVerificationCode,
 * checkoutGuest (group'a delege), guestCheckout + OTP yardımcıları — OrderCheckoutService'ten
 * birebir taşındı. DI: checkoutCommon + group (checkoutGuest için) + leaf'ler
 * (prisma, cache, config, notification, surat, orderPricing, orderCommon); döngü yok.
 */
@Injectable()
export class OrderGuestCheckoutService {
  private readonly logger = new Logger(OrderGuestCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly suratCargoService: SuratCargoService,
    private readonly orderPricing: OrderPricingService,
    private readonly orderCommon: OrderCommonService,
    private readonly checkoutCommon: OrderCheckoutCommonService,
    private readonly group: OrderCheckoutGroupService,
  ) {}

  /**
   * Misafir checkout öncesi e-posta OTP gönderir (Redis + e-posta).
   * expectedCheckoutCount: sepetteki misafir sipariş satırı sayısı (her başarılı guest checkout bir hak tüketir).
   */
  async sendGuestCheckoutVerificationCode(
    dto: GuestSendVerificationCodeDto,
  ): Promise<{
    success: boolean;
    expiresInSeconds: number;
  }> {
    const normEmail = this.normalizeGuestCheckoutEmail(dto.email);

    // Zaten kayıtlı bir hesabın e-postasıyla misafir alışverişe izin verme:
    // hiç kod göndermeden "bu e-posta kayıtlı, giriş yapın" de. (case-insensitive:
    // kullanıcı e-postaları DB'de orijinal case ile saklanıyor olabilir.)
    await this.assertGuestEmailNotRegistered(normEmail);

    const windowSec = parseInt(
      this.configService.get<string>(
        "GUEST_CHECKOUT_OTP_SEND_WINDOW_SEC",
        "900",
      ),
      10,
    );
    const maxSends = parseInt(
      this.configService.get<string>(
        "GUEST_CHECKOUT_OTP_MAX_SEND_PER_WINDOW",
        "3",
      ),
      10,
    );
    const ttlSec = parseInt(
      this.configService.get<string>("GUEST_CHECKOUT_OTP_TTL_SEC", "600"),
      10,
    );
    const maxVerifyAttempts = parseInt(
      this.configService.get<string>(
        "GUEST_CHECKOUT_OTP_MAX_VERIFY_ATTEMPTS",
        "5",
      ),
      10,
    );

    const now = Date.now();
    const rlKey = this.guestCheckoutOtpRateKey(normEmail);
    const prevSends = (await this.cache.get<number[]>(rlKey)) || [];
    const windowMs = Math.max(60, windowSec) * 1000;
    const recentSends = prevSends.filter((t) => now - t < windowMs);
    if (recentSends.length >= maxSends) {
      throw new BadRequestException(
        i18nMessage("server.order.guestOtpTooManyRequests"),
      );
    }
    recentSends.push(now);
    await this.cache.set(rlKey, recentSends, { ttl: windowSec });

    const consumptions = Math.min(
      20,
      Math.max(1, dto.expectedCheckoutCount ?? 1),
    );
    const codeNum = randomInt(0, 1_000_000);
    const code = String(codeNum).padStart(6, "0");
    const h = this.hashGuestCheckoutOtp(normEmail, code);

    const sendResult =
      await this.notificationService.sendGuestCheckoutVerificationCode(
        normEmail,
        code,
        ttlSec,
      );
    if (!sendResult.success) {
      throw new BadRequestException(
        i18nMessage("server.order.guestOtpSendFailed"),
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

  /**
   * Batch checkout (misafir): OTP grup için bir kez tüketilir.
   * POST /orders/checkout/guest
   */
  async checkoutGuest(dto: GuestCheckoutGroupDto) {
    // İdempotensi OTP tüketiminden ÖNCE: replay yeni kod istememeli
    const replayed = await this.group.findCheckoutGroupReplay(
      dto.idempotencyKey,
    );
    if (replayed) {
      return replayed;
    }
    const shippingTariff =
      await this.orderPricing.resolveShippingTariffSnapshot(
        dto.expectedShippingTariffVersion,
        true,
      );

    const normEmail = this.normalizeGuestCheckoutEmail(dto.email);
    await this.consumeGuestCheckoutOtp(normEmail, dto.emailVerificationCode);

    if (!dto.shippingAddress) {
      throw new BadRequestException(
        i18nMessage("server.order.shippingAddressRequired"),
      );
    }

    const guestUser = await this.getOrCreateSystemGuestUser();

    return this.group.createCheckoutGroup({
      buyerId: guestUser.id,
      dto,
      isGuest: true,
      guest: {
        email: normEmail,
        phone: dto.phone?.trim(),
        name: dto.guestName?.trim(),
      },
      shippingTariffSnapshot: shippingTariff,
    });
  }

  /**
   * Guest checkout - Create order without registration
   * Requirement: Guest checkout (requirements.txt)
   */
  async guestCheckout(dto: GuestCheckoutDto) {
    const normEmail = this.normalizeGuestCheckoutEmail(dto.email);
    const shippingTariff =
      await this.orderPricing.resolveShippingTariffSnapshot(
        dto.expectedShippingTariffVersion,
        true,
      );
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
        throw new NotFoundException(
          i18nMessage("server.order.productNotFound"),
        );
      }

      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        include: {
          images: { take: 1, orderBy: { sortOrder: "asc" } },
          seller: { select: { id: true, email: true, displayName: true } },
        },
      });

      if (!product) {
        throw new NotFoundException(
          i18nMessage("server.order.productNotFound"),
        );
      }

      if (product.status !== ProductStatus.active) {
        throw new BadRequestException(
          i18nMessage("server.order.productNotOnSale"),
        );
      }

      // Adet bazlı stok: müsait adet >= 1
      const available = getAvailableQuantity(product);
      if (available !== null && available < 1) {
        throw new BadRequestException(
          i18nMessage("server.order.productOutOfStock"),
        );
      }

      // Price is ALWAYS derived server-side — NEVER from the client. A guest was
      // previously able to submit `dto.price: 1` on this public route and pay ~1 TL
      // for any item (the PayTR amount-check validates against this same tampered
      // total). Direct buy -> the product's own (sale) price; accepted offer -> the
      // offer amount (set below).
      let finalPrice = Number(product.salePrice ?? product.price);

      if (dto.offerId) {
        const offer = await tx.offer.findUnique({
          where: { id: dto.offerId },
        });

        if (!offer || offer.productId !== dto.productId) {
          throw new BadRequestException(
            i18nMessage("server.order.invalidOffer"),
          );
        }

        if (offer.status !== OfferStatus.accepted) {
          throw new BadRequestException(
            i18nMessage("server.order.offerNotAcceptedYet"),
          );
        }

        finalPrice = Number(offer.amount);
      }

      this.orderPricing.assertPricingUnchanged(dto.expectedPricingHash, [
        {
          productId: dto.productId,
          unitPrice: finalPrice,
          quantity: 1,
          shippingDesi: product.shippingDesi,
        },
      ]);

      // Get or create a system guest user for all guest orders
      // This avoids unique constraint issues - actual guest info stored in shippingAddress
      const SYSTEM_GUEST_EMAIL = "guest@tarodan.system";
      let systemGuestUser = await tx.user.findUnique({
        where: { email: SYSTEM_GUEST_EMAIL },
      });

      if (!systemGuestUser) {
        systemGuestUser = await tx.user.create({
          data: {
            email: SYSTEM_GUEST_EMAIL,
            displayName: "GUEST_SYSTEM",
            passwordHash: "",
            isVerified: false,
            isSeller: false,
          },
        });
      }

      const guestUser = systemGuestUser;

      // Validate shipping address for guest checkout
      if (!dto.shippingAddress?.fullName?.trim()) {
        throw new BadRequestException(
          i18nMessage("server.order.shippingAddressNameRequired"),
        );
      }
      if (!dto.shippingAddress?.phone?.trim()) {
        throw new BadRequestException(
          i18nMessage("server.order.shippingAddressPhoneRequired"),
        );
      }
      if (!dto.shippingAddress?.city?.trim()) {
        throw new BadRequestException(
          i18nMessage("server.order.shippingAddressCityRequired"),
        );
      }
      if (!dto.shippingAddress?.district?.trim()) {
        throw new BadRequestException(
          i18nMessage("server.order.shippingAddressDistrictRequired"),
        );
      }
      if (!dto.shippingAddress?.address?.trim()) {
        throw new BadRequestException(
          i18nMessage("server.order.shippingAddressLineRequired"),
        );
      }

      // Calculate commission with category-based matching (3.3)
      // Commission is calculated on product price, not including shipping
      const commissionResult = await this.orderPricing.calculateCommission(
        finalPrice,
        product.sellerId,
        product.categoryId, // Pass categoryId for priority-based matching
      );

      // Kargo kararı (quote ile ORTAK): paket desisi → kademe → o kademenin payı →
      // bölüşüm. Alıcı yalnız kendi payını öder; kalanı satıcı üstlenir.
      const {
        fullShipping,
        buyer: buyerShippingAmount,
        seller: sellerShippingAmount,
      } = this.orderPricing.resolveShippingDecision({
        tariff: shippingTariff.tariff,
        subtotal: finalPrice,
        billableDesi: product.shippingDesi,
        lineShares: [commissionResult.shippingBuyerShares],
      });
      const shippingCost = buyerShippingAmount; // buyer-charged shipping
      // Vergiler: ürün KDV'si (politikayla kapalı), hizmet KDV'si (iki taraf) ve stopaj.
      const {
        taxAmount: guestTaxAmount,
        withholdingTaxAmount: guestWithholdingAmount,
        buyerServiceTaxAmount: guestBuyerServiceTax,
        sellerServiceTaxAmount: guestSellerServiceTax,
      } = await this.checkoutCommon.resolveOrderTaxes({
        sellerId: product.sellerId,
        categoryId: product.categoryId,
        subtotal: finalPrice,
        fees: {
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          buyerShippingAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          sellerShippingAmount,
        },
      });
      // Alıcı ücretleri + ürün KDV'si + alıcıya verilen hizmetlerin KDV'si eklenir
      // (stopaj ve satıcı hizmet KDV'si satıcı payout'undan kesilir).
      const totalAmount =
        finalPrice +
        shippingCost +
        commissionResult.buyerFeeAmount +
        guestTaxAmount +
        guestBuyerServiceTax;
      const guestOriginalPrice = Number(product.price);
      const guestDiscountAmount = Math.max(0, guestOriginalPrice - finalPrice);

      // Generate order number
      const orderNumber = await this.checkoutCommon.generateOrderNumber();

      const guestSuratKey =
        dto.idempotencyKey?.trim() ||
        this.checkoutCommon.buildSuratIdempotencyKey([
          dto.email?.trim() || "",
          dto.productId,
          dto.offerId || "",
          `${dto.shippingAddress.city}|${dto.shippingAddress.phone}|${dto.shippingAddress.address}`,
        ]);

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
      if (
        dto.billingAddress?.fullName?.trim() &&
        dto.billingAddress?.city?.trim() &&
        dto.billingAddress?.address?.trim()
      ) {
        (guestShippingJson as any).billingAddress = {
          fullName: dto.billingAddress.fullName.trim(),
          phone:
            dto.billingAddress.phone?.trim() ||
            dto.shippingAddress.phone.trim(),
          city: dto.billingAddress.city.trim(),
          district: dto.billingAddress.district?.trim() || "",
          address: dto.billingAddress.address.trim(),
          zipCode: dto.billingAddress.zipCode?.trim() || null,
        };
      }

      // Tek siparişlik grup (misafir yolu)
      const guestOrderGroup = await tx.checkoutGroup.create({
        data: {
          groupNumber: reprefixReference(
            orderNumber,
            REFERENCE_PREFIX.checkoutGroup,
          ),
          buyerId: guestUser.id,
          totalAmount,
          isGuest: true,
        },
      });

      // Faz 1: misafir tek siparişi de satıcı-paketi altında (uniform model).
      const guestOrderPackage = await tx.orderPackage.create({
        data: {
          packageNumber: await this.checkoutCommon.generatePackageNumber(),
          checkoutGroupId: guestOrderGroup.id,
          sellerId: product.sellerId,
          buyerId: guestUser.id,
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

      // Create order - store all guest info in shippingAddress JSON
      const order = await tx.order.create({
        data: {
          orderNumber,
          productId: dto.productId,
          buyerId: guestUser.id,
          sellerId: product.sellerId,
          offerId: dto.offerId,
          checkoutGroupId: guestOrderGroup.id,
          packageId: guestOrderPackage.id,
          totalAmount,
          quantity: 1,
          unitPrice: finalPrice,
          subtotal: guestOriginalPrice,
          discountAmount: guestDiscountAmount,
          shippingCost,
          taxAmount: guestTaxAmount,
          withholdingTaxAmount: guestWithholdingAmount,
          buyerServiceTaxAmount: guestBuyerServiceTax,
          sellerServiceTaxAmount: guestSellerServiceTax,
          commissionAmount: commissionResult.commissionAmount,
          buyerFeeAmount: commissionResult.buyerFeeAmount,
          sellerFeeAmount: commissionResult.sellerFeeAmount,
          buyerCommissionAmount: commissionResult.buyerCommissionAmount,
          buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
          sellerCommissionAmount: commissionResult.sellerCommissionAmount,
          sellerPlatformFeeAmount: commissionResult.sellerPlatformFeeAmount,
          buyerShippingAmount,
          sellerShippingAmount,
          financialSnapshot: this.checkoutCommon.buildFinancialSnapshot({
            pricingHash: dto.expectedPricingHash,
            productId: dto.productId,
            quantity: 1,
            unitPrice: finalPrice,
            originalUnitPrice: guestOriginalPrice,
            subtotal: guestOriginalPrice,
            discountAmount: guestDiscountAmount,
            platformFundedDiscount: 0,
            shipping: {
              tariffId: shippingTariff.tariffId,
              tariffVersion: shippingTariff.tariffVersion,
              fullAmount: fullShipping,
              buyerAmount: buyerShippingAmount,
              sellerAmount: sellerShippingAmount,
            },
            commission: commissionResult,
            taxAmount: guestTaxAmount,
            withholdingTaxAmount: guestWithholdingAmount,
            buyerServiceTaxAmount: guestBuyerServiceTax,
            sellerServiceTaxAmount: guestSellerServiceTax,
            totalAmount,
          }),
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddress: guestShippingJson as Prisma.InputJsonValue,
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

  private async getOrCreateSystemGuestUser() {
    const SYSTEM_GUEST_EMAIL = "guest@tarodan.system";
    const existing = await this.prisma.user.findUnique({
      where: { email: SYSTEM_GUEST_EMAIL },
    });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        email: SYSTEM_GUEST_EMAIL,
        displayName: "GUEST_SYSTEM",
        passwordHash: "",
        isVerified: false,
        isSeller: false,
      },
    });
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
  private async assertGuestEmailNotRegistered(
    normEmail: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: normEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      // ConflictException (409) + makine-okunur kod → frontend giriş'e yönlendirir.
      throw new ConflictException({
        code: "EMAIL_ALREADY_REGISTERED",
        message:
          "Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapıp alışverişe devam edin.",
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
    return this.configService.getOrThrow<string>("GUEST_CHECKOUT_OTP_SECRET");
  }

  private hashGuestCheckoutOtp(normEmail: string, code: string): string {
    return createHash("sha256")
      .update(`${this.guestCheckoutOtpPepper()}:${normEmail}:${code}`, "utf8")
      .digest("hex");
  }

  private async consumeGuestCheckoutOtp(
    normEmail: string,
    code: string,
  ): Promise<void> {
    const otpKey = this.guestCheckoutOtpKey(normEmail);
    const record = await this.cache.get<{
      h: string;
      a: number;
      c: number;
      v?: number;
    }>(otpKey);

    if (!record?.h) {
      throw new BadRequestException(
        i18nMessage("server.order.guestOtpInvalidOrExpired"),
      );
    }

    const maxWrong = record.v ?? 5;
    if (record.a >= maxWrong) {
      await this.cache.del(otpKey);
      throw new BadRequestException(
        i18nMessage("server.order.guestOtpTooManyAttempts"),
      );
    }

    const expectedHex = this.hashGuestCheckoutOtp(normEmail, code.trim());
    const aBuf = Buffer.from(record.h, "hex");
    const bBuf = Buffer.from(expectedHex, "hex");
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
      throw new BadRequestException(
        i18nMessage("server.order.guestOtpIncorrect"),
      );
    }

    record.c -= 1;
    if (record.c <= 0) {
      await this.cache.del(otpKey);
    } else if (ttlLeft > 0) {
      await this.cache.set(
        otpKey,
        { h: record.h, a: 0, c: record.c, v: maxWrong },
        { ttl: ttlLeft },
      );
    } else {
      await this.cache.del(otpKey);
    }
  }
}
