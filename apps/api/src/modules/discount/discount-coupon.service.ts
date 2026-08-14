import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ValidateCouponDto, ValidationResultDto } from "./dto";
import {
  DiscountScope,
  DiscountFundedBy,
  DiscountTarget,
  DiscountAudience,
  CouponReservationStatus,
} from "@prisma/client";
import { audienceMatches } from "./helpers/discount-authorization";
import { isProductInDiscountScope } from "./helpers/discount-scope";
import { resolveUserTier } from "./helpers/user-tier";
import { DiscountPricingService } from "./discount-pricing.service";

/**
 * Bir kupon kodunun bu sepette geçerli olup olmadığı ve geçerliyse ne kadar
 * indirdiği. DiscountService'ten birebir taşındı.
 *
 * Kupon doğrulaması sepet önizlemesinde ve checkout'ta AYNI yanıtı vermek
 * zorunda: alıcıya "geçerli" denip ödeme adımında reddedilen bir kod, ya da
 * önizlemede başka tutar gösteren bir hesap, doğrudan para farkıdır. Tek
 * gövde tek yerde durunca ikisi ayrışamaz.
 */
@Injectable()
export class DiscountCouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: DiscountPricingService,
  ) {}

  /**
   * Validate a coupon code
   */
  async validateCoupon(
    dto: ValidateCouponDto,
    /**
     * Kuponu uygulayan kullanıcı. Misafir (giriş yapmamış) sepet doğrulamasında
     * `null` gelir — bu durumda kişi-başı kullanım limiti kontrol EDİLEMEZ (kimlik
     * yok), yalnızca toplam limit + tarih + min sepet uygulanır. Kişi-başı limit
     * checkout'ta (giriş/e-posta ile) devreye girer.
     */
    userId: string | null,
  ): Promise<ValidationResultDto> {
    const code = dto.code.toUpperCase();
    const sellerCategoryInclude = {
      seller: { select: { id: true, displayName: true } },
      category: { select: { id: true, name: true } },
      // Hedef kitle eşleşmesi kupon için de geçerlidir: üyelik/kişi hedefli bir
      // kod, hedefte olmayan alıcıda kabul edilmemelidir.
      targetTiers: { select: { tierType: true } },
      targetUsers: { select: { userId: true } },
    };

    let discount = await this.prisma.discount.findUnique({
      where: { code },
      include: sellerCategoryInclude,
    });

    // Voucher (tek-kullanımlık) kodu: paylaşımlı Discount.code bulunamazsa
    // DiscountCode tablosuna bak → parent Discount kuralları geçerli, ek olarak
    // kod tek kullanımlıktır (isRedeemed).
    let voucherCodeId: string | undefined;
    let voucherHasOwnWindow = false;
    if (!discount) {
      const voucher = await this.prisma.discountCode.findUnique({
        where: { code },
        include: { discount: { include: sellerCategoryInclude } },
      });
      if (!voucher) {
        return { isValid: false, error: "Kupon kodu bulunamadı" };
      }
      if (voucher.isRedeemed) {
        return { isValid: false, error: "Bu kupon kodu daha önce kullanıldı" };
      }
      discount = voucher.discount;
      voucherCodeId = voucher.id;
      // Koda özel süre varsa kampanyanın tarih penceresi yerine O geçerlidir:
      // kusursuz alıcıya iade edilen kupon, kampanya bitmiş olsa da yaşar.
      if (voucher.expiresAt) {
        if (new Date() > voucher.expiresAt) {
          return { isValid: false, error: "Bu kuponun süresi doldu" };
        }
        voucherHasOwnWindow = true;
      }
    }

    if (!discount.isActive) {
      return { isValid: false, error: "Bu kupon artık aktif değil" };
    }

    // Cep kuralı: admin ürün fiyatından İNDİRİM YAPAMAZ. Eski platform/paylaşımlı
    // fonlu ürün-fiyatı kuponları tanım tarafında çoktan engellendi; aktif kalmış
    // eski bir kayıt da yeni siparişlere uygulanmaz — aksi halde
    // `platformFundedDiscount` yeni siparişlerde tekrar dolardı.
    const couponTargetsPrice =
      (discount.target ?? DiscountTarget.product_price) ===
      DiscountTarget.product_price;
    if (couponTargetsPrice && discount.fundedBy !== DiscountFundedBy.seller) {
      return { isValid: false, error: "Bu kupon artık geçerli değil" };
    }

    const now = new Date();
    if (!voucherHasOwnWindow) {
      if (now < discount.startDate) {
        return { isValid: false, error: "Bu kupon henüz başlamadı" };
      }

      if (now > discount.endDate) {
        return { isValid: false, error: "Bu kuponun süresi doldu" };
      }
    }

    // Hedef kitle: kimlik gerektiren bir hedefte misafir kabul edilemez (kimin
    // hedefte olduğu bilinemez → sessizce herkese açılırdı).
    if (
      discount.audience === DiscountAudience.membership_tiers ||
      discount.audience === DiscountAudience.specific_buyers
    ) {
      if (!userId) {
        return {
          isValid: false,
          error: "Bu kupon için giriş yapmanız gerekir",
        };
      }
      const buyerTier =
        discount.audience === DiscountAudience.membership_tiers
          ? await resolveUserTier(this.prisma, userId)
          : null;
      const matches = audienceMatches({
        audience: discount.audience,
        target: discount.target ?? DiscountTarget.product_price,
        tierTypes: (discount as any).targetTiers.map(
          (row: { tierType: string }) => row.tierType,
        ),
        userIds: (discount as any).targetUsers.map(
          (row: { userId: string }) => row.userId,
        ),
        buyerId: userId,
        buyerTier,
      });
      if (!matches) {
        return {
          isValid: false,
          error: "Bu kupon hesabınız için geçerli değil",
        };
      }
    }

    // Bütçe tavanı: bedel kuponunun maliyeti platformundur, tavan dolduysa kupon
    // yeni sepetlere uygulanmaz.
    const budgetRemaining =
      discount.budgetLimit != null
        ? Math.max(
            0,
            Number(discount.budgetLimit) - Number(discount.budgetSpent ?? 0),
          )
        : null;
    if (discount.budgetStoppedAt || budgetRemaining === 0) {
      return { isValid: false, error: "Bu kampanyanın bütçesi doldu" };
    }

    // Real usage is incremented only after successful payment. Active checkout
    // reservations still count against capacity so the last coupon cannot be sold
    // to several buyers concurrently.
    const activeReservationWhere = {
      discountId: discount.id,
      status: CouponReservationStatus.active,
      expiresAt: { gt: now },
    };
    const activeReservationCount = await this.prisma.couponReservation.count({
      where: activeReservationWhere,
    });

    // Check total usage limit
    if (
      discount.usageLimitTotal &&
      discount.usedCount + activeReservationCount >= discount.usageLimitTotal
    ) {
      return { isValid: false, error: "Bu kupon kullanım limitine ulaştı" };
    }

    // Per-user-limited coupons require an IDENTIFIED user. Guests share one system
    // identity, so the per-user limit can't be enforced for them (F4.5) — require
    // login rather than silently letting guests bypass the limit.
    if (discount.usageLimitPerUser) {
      if (!userId) {
        return {
          isValid: false,
          error: "Bu kupon için giriş yapmanız gerekir",
        };
      }
      const userUsageCount = await this.prisma.discountUsage.count({
        // İptal edilmiş (geri verilmiş) kullanım kotayı işgal etmez.
        where: { discountId: discount.id, userId, revokedAt: null },
      });
      const userReservationCount = await this.prisma.couponReservation.count({
        where: {
          ...activeReservationWhere,
          userId,
        },
      });
      if (userUsageCount + userReservationCount >= discount.usageLimitPerUser) {
        return {
          isValid: false,
          error: "Bu kuponu zaten kullandınız",
        };
      }
    }

    if (voucherCodeId) {
      const voucherReserved = await this.prisma.couponReservation.count({
        where: {
          voucherCodeId,
          status: CouponReservationStatus.active,
          expiresAt: { gt: now },
        },
      });
      if (voucherReserved > 0) {
        return {
          isValid: false,
          error: "Bu kupon kodu başka bir ödemede ayrıldı",
        };
      }
    }

    // Sum the full cart total and, separately, the subtotal of items ELIGIBLE for
    // this discount (respecting seller/category/product scope). Eligible ids are
    // returned so checkout distributes the discount ONLY across eligible lines.
    let cartTotal = 0;
    let eligibleSubtotal = 0;
    const eligibleProductIds: string[] = [];

    if (dto.cartItems?.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: dto.cartItems.map((i) => i.productId) } },
      });
      const effectivePrices = await this.pricing.getEffectiveDisplayPriceMany(
        products.map((product) => ({
          productId: product.id,
          sellerId: product.sellerId,
          categoryId: product.categoryId ?? "",
          currentDisplayPrice: Number(product.price),
        })),
      );

      for (const item of dto.cartItems) {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          const unitPrice =
            effectivePrices.get(product.id) ?? Number(product.price);
          const itemPrice = unitPrice * item.quantity;
          cartTotal += itemPrice;
          if (isProductInDiscountScope(product, discount)) {
            eligibleSubtotal += itemPrice;
            eligibleProductIds.push(product.id);
          }
        }
      }
    }

    // Kupon AKTİF olabilir ama sepetteki hiçbir ürün kapsamına girmiyorsa
    // uygulanmamalı: eligibleSubtotal 0 kalır, indirim 0 çıkar ve kupon
    // "uygulandı" görünüp hiçbir şey indirmezdi. Kullanıcı sebebini göremediği
    // için kuponu bozuk sanıyordu.
    if (dto.cartItems?.length && eligibleProductIds.length === 0) {
      return {
        isValid: false,
        error: "Bu kupon sepetinizdeki ürünler için geçerli değil",
      };
    }

    // Check minimum cart value
    if (discount.minCartValue && cartTotal < Number(discount.minCartValue)) {
      return {
        isValid: false,
        error: `Minimum sepet tutarı: ${Number(discount.minCartValue).toFixed(2)} TL`,
      };
    }

    // Fixed-amount coupons are applied ONCE, capped to the eligible subtotal — never
    // multiplied per eligible line and never exceeding the discountable amount (so a
    // multi-item cart can't drive the order total negative). maxDiscountAmount is the
    // final cap. Single source of truth for coupon math (see computeCouponDiscount).
    // Bedel hedefli kuponda ürün tabanına DOKUNULMAZ; tutar ancak komisyon/kargo
    // hesaplandıktan sonra bilinir (fiyat hattı motoru uygular). Bu yüzden burada
    // 0 döner ve hedef bilgisi taşınır.
    // Hedefi yazılmamış (eski) kayıt ürün fiyatı kuponu sayılır — sessizce bedel
    // kuponuna dönüşmemeli.
    const couponTarget = discount.target ?? DiscountTarget.product_price;
    const isFeeCoupon = couponTarget !== DiscountTarget.product_price;
    const estimatedDiscount = isFeeCoupon
      ? 0
      : this.computeCouponDiscount(
          discount.type,
          Number(discount.value),
          eligibleSubtotal,
          discount.maxDiscountAmount != null
            ? Number(discount.maxDiscountAmount)
            : null,
        );

    return {
      isValid: true,
      discount: {
        id: discount.id,
        name: discount.name,
        // Voucher'da parent şablonun `code`'u null'dır → girilen kodu döndür.
        code: discount.code ?? code,
        type: discount.type,
        value: Number(discount.value),
        scope: discount.scope,
        estimatedDiscount,
        eligibleProductIds,
        platformFundedShare:
          // Bedel kuponunun maliyeti tanımı gereği platformundur; ürün fiyatı
          // kuponunda eski fonlama ekseni geçerlidir (eski kayıtlar için).
          isFeeCoupon
            ? 1
            : discount.fundedBy === DiscountFundedBy.platform
              ? 1
              : discount.fundedBy === DiscountFundedBy.shared
                ? Number(discount.platformFundedRatio ?? 0)
                : 0,
        voucherCodeId,
        target: couponTarget,
        budgetRemaining,
        maxDiscountAmount:
          discount.maxDiscountAmount != null
            ? Number(discount.maxDiscountAmount)
            : null,
      },
    };
  }

  /**
   * Single source of truth for coupon discount math. Fixed-amount coupons are
   * capped to the eligible (discountable) subtotal so they are applied at most once
   * and can never exceed what is discountable; percentage coupons scale with it.
   * `maxDiscountAmount` (when set) is the final ceiling. Returns 0 when nothing is
   * eligible.
   */
  computeCouponDiscount(
    type: string,
    value: number,
    eligibleSubtotal: number,
    maxDiscountAmount?: number | null,
  ): number {
    if (eligibleSubtotal <= 0 || value <= 0) return 0;
    let discount =
      type === "percentage"
        ? eligibleSubtotal * (value / 100)
        : Math.min(value, eligibleSubtotal);
    if (maxDiscountAmount != null && discount > maxDiscountAmount) {
      discount = maxDiscountAmount;
    }
    return discount;
  }
}
