import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { DiscountScope, DiscountType, ProductStatus } from "@prisma/client";
import { resolveSalePrice } from "../product/helpers/product-sale-window";

// Configuration constants
const FREE_SHIPPING_THRESHOLD = 500;
const BASE_SHIPPING_COST = 29.99;
const MAX_DISCOUNT_PERCENT = 0.5; // 50% max discount

/**
 * Applied discount info for tracking
 */
export interface AppliedDiscount {
  discountId: string;
  discountName: string;
  discountCode?: string;
  type: DiscountType;
  value: number;
  scope: DiscountScope;
  appliedAmount: number;
  affectedProductIds?: string[];
}

/**
 * Individual cart item with calculation details
 */
export interface CalculatedCartItem {
  productId: string;
  productTitle: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  originalPrice: number;
  salePrice: number | null;
  finalPrice: number;
  lineTotal: number;
  appliedDiscounts: AppliedDiscount[];
  isAvailable: boolean;
}

/**
 * Complete cart calculation result
 */
export interface CartCalculationResult {
  items: CalculatedCartItem[];
  itemCount: number;
  subtotal: number;
  productDiscountTotal: number;
  couponDiscountTotal: number;
  campaignDiscountTotal: number;
  totalDiscount: number;
  shippingCost: number;
  amountToFreeShipping: number;
  grandTotal: number;
  appliedDiscounts: AppliedDiscount[];
  warnings: string[];
}

/**
 * Input for calculation - can be from cart or direct order
 */
export interface CartInput {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  couponCode?: string;
  userId: string;
}

@Injectable()
export class DiscountCalculator {
  private readonly logger = new Logger(DiscountCalculator.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Main calculation method - calculates full cart totals with all discounts
   */
  async calculateCartTotal(input: CartInput): Promise<CartCalculationResult> {
    const now = new Date();
    const result: CartCalculationResult = {
      items: [],
      itemCount: 0,
      subtotal: 0,
      productDiscountTotal: 0,
      couponDiscountTotal: 0,
      campaignDiscountTotal: 0,
      totalDiscount: 0,
      shippingCost: 0,
      amountToFreeShipping: 0,
      grandTotal: 0,
      appliedDiscounts: [],
      warnings: [],
    };

    if (!input.items.length) {
      return result;
    }

    // Step 1: Fetch all products with their details
    const products = await this.prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Step 2: A + oldPrice – price (A) = güncel satış fiyatı; finalPrice = price
    for (const inputItem of input.items) {
      const product = productMap.get(inputItem.productId);
      if (!product) {
        result.warnings.push(`Ürün bulunamadı: ${inputItem.productId}`);
        continue;
      }

      // İndirim penceresi ORTAK kuraldan: pencere dışındaysa satış fiyatı
      // indirim öncesi fiyattır (sepet, vitrin ve tahsilat aynı sayıyı görür).
      const sale = resolveSalePrice(product, now);
      const priceA = sale.price;
      const isOnSale = sale.isOnSale;
      const originalPrice = sale.oldPrice ?? priceA;
      const finalPrice = priceA;
      const lineTotal = finalPrice * inputItem.quantity;
      const productDiscount = isOnSale
        ? (originalPrice - priceA) * inputItem.quantity
        : 0;

      const isAvailable = product.status === ProductStatus.active;
      if (!isAvailable) {
        result.warnings.push(`"${product.title}" artık satışta değil`);
      }

      const calculatedItem: CalculatedCartItem = {
        productId: product.id,
        productTitle: product.title,
        sellerId: product.sellerId,
        sellerName: product.seller?.displayName || "Satıcı",
        quantity: inputItem.quantity,
        originalPrice,
        salePrice: isOnSale ? priceA : null,
        finalPrice,
        lineTotal,
        appliedDiscounts: [],
        isAvailable,
      };

      // Track product-level discount
      if (productDiscount > 0) {
        calculatedItem.appliedDiscounts.push({
          discountId: "product-sale",
          discountName: "Ürün İndirimi",
          type: DiscountType.fixed_amount,
          value: productDiscount / inputItem.quantity,
          scope: DiscountScope.product,
          appliedAmount: productDiscount,
          affectedProductIds: [product.id],
        });
        result.productDiscountTotal += productDiscount;
      }

      result.items.push(calculatedItem);
      result.subtotal += lineTotal;
      result.itemCount += inputItem.quantity;
    }

    // Step 3: Kodsuz (otomatik) indirim kaldırıldı – seller auto campaigns devre dışı

    // Step 4: Apply coupon code if present
    let couponIsStackable = true;
    if (input.couponCode) {
      const couponResult = await this.applyCouponDiscount(
        input.couponCode,
        result.items,
        input.userId,
        now,
      );
      result.couponDiscountTotal = couponResult.discountAmount;
      if (couponResult.appliedDiscount) {
        result.appliedDiscounts.push(couponResult.appliedDiscount);
        couponIsStackable = couponResult.isStackable ?? true;
      }
      if (couponResult.warning) {
        result.warnings.push(couponResult.warning);
      }
    }

    // Step 5: Kodsuz (otomatik) indirim kaldırıldı – platform auto campaigns devre dışı

    // Step 6: Calculate total discount and apply max cap
    result.totalDiscount =
      result.productDiscountTotal +
      result.couponDiscountTotal +
      result.campaignDiscountTotal;

    // Calculate original subtotal (before any discounts)
    const originalSubtotal = result.items.reduce(
      (sum, item) => sum + item.originalPrice * item.quantity,
      0,
    );

    // Apply 50% max discount cap
    const maxDiscount = originalSubtotal * MAX_DISCOUNT_PERCENT;
    if (result.totalDiscount > maxDiscount) {
      result.totalDiscount = maxDiscount;
      result.warnings.push("Maksimum indirim limitine ulaşıldı (%50)");
    }

    // Step 7: Calculate shipping
    result.shippingCost =
      result.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : BASE_SHIPPING_COST;
    result.amountToFreeShipping =
      result.subtotal >= FREE_SHIPPING_THRESHOLD
        ? 0
        : FREE_SHIPPING_THRESHOLD - result.subtotal;

    // Step 8: Calculate grand total
    result.grandTotal = Math.max(
      0,
      result.subtotal - result.totalDiscount + result.shippingCost,
    );

    return result;
  }

  /** A + oldPrice: indirimde mi (oldPrice dolu + tarih geçerli) */
  private isProductOnSale(product: any, now: Date): boolean {
    if (product.oldPrice == null) return false;
    const saleStart = product.saleStartDate
      ? new Date(product.saleStartDate)
      : null;
    const saleEnd = product.saleEndDate ? new Date(product.saleEndDate) : null;
    if (saleStart && now < saleStart) return false;
    if (saleEnd && now > saleEnd) return false;
    return true;
  }

  /**
   * Apply seller-specific auto discounts
   */
  private async applySellerDiscounts(
    items: CalculatedCartItem[],
    now: Date,
  ): Promise<{
    totalDiscount: number;
    appliedDiscounts: AppliedDiscount[];
    warnings: string[];
  }> {
    const appliedDiscounts: AppliedDiscount[] = [];
    const warnings: string[] = [];
    let totalDiscount = 0;

    // Group items by seller
    const sellerGroups = new Map<string, CalculatedCartItem[]>();
    for (const item of items) {
      if (!item.isAvailable) continue;
      const group = sellerGroups.get(item.sellerId) || [];
      group.push(item);
      sellerGroups.set(item.sellerId, group);
    }

    // For each seller, find applicable auto discounts
    for (const [sellerId, sellerItems] of sellerGroups) {
      const sellerSubtotal = sellerItems.reduce((s, i) => s + i.lineTotal, 0);

      const sellerDiscounts = await this.prisma.discount.findMany({
        where: {
          sellerId,
          isActive: true,
          code: null, // Auto-applied only
          startDate: { lte: now },
          endDate: { gte: now },
          scope: DiscountScope.seller,
        },
        orderBy: { priority: "asc" },
      });

      for (const discount of sellerDiscounts) {
        // Check min cart value
        if (
          discount.minCartValue &&
          sellerSubtotal < Number(discount.minCartValue)
        ) {
          continue;
        }

        let discountAmount = 0;
        if (discount.type === DiscountType.percentage) {
          discountAmount = sellerSubtotal * (Number(discount.value) / 100);
        } else {
          discountAmount = Math.min(Number(discount.value), sellerSubtotal);
        }

        // Apply max cap
        if (
          discount.maxDiscountAmount &&
          discountAmount > Number(discount.maxDiscountAmount)
        ) {
          discountAmount = Number(discount.maxDiscountAmount);
        }

        if (discountAmount > 0) {
          totalDiscount += discountAmount;
          appliedDiscounts.push({
            discountId: discount.id,
            discountName: discount.name,
            type: discount.type,
            value: Number(discount.value),
            scope: discount.scope,
            appliedAmount: discountAmount,
            affectedProductIds: sellerItems.map((i) => i.productId),
          });

          // Track on items
          for (const item of sellerItems) {
            const itemShare =
              (item.lineTotal / sellerSubtotal) * discountAmount;
            item.appliedDiscounts.push({
              discountId: discount.id,
              discountName: discount.name,
              type: discount.type,
              value: Number(discount.value),
              scope: discount.scope,
              appliedAmount: itemShare,
            });
          }

          // Stop if not stackable
          if (!discount.isStackable) break;
        }
      }
    }

    return { totalDiscount, appliedDiscounts, warnings };
  }

  /**
   * Apply coupon discount
   */
  private async applyCouponDiscount(
    code: string,
    items: CalculatedCartItem[],
    userId: string,
    now: Date,
  ): Promise<{
    discountAmount: number;
    appliedDiscount?: AppliedDiscount;
    warning?: string;
    isStackable?: boolean;
  }> {
    const discount = await this.prisma.discount.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!discount) {
      return { discountAmount: 0, warning: "Kupon kodu bulunamadı" };
    }

    if (!discount.isActive) {
      return { discountAmount: 0, warning: "Bu kupon artık aktif değil" };
    }

    if (now < discount.startDate || now > discount.endDate) {
      return { discountAmount: 0, warning: "Kuponun süresi doldu" };
    }

    // Check total usage limit
    if (
      discount.usageLimitTotal &&
      discount.usedCount >= discount.usageLimitTotal
    ) {
      return { discountAmount: 0, warning: "Kupon kullanım limitine ulaştı" };
    }

    // Check per-user limit
    if (discount.usageLimitPerUser) {
      const userUsageCount = await this.prisma.discountUsage.count({
        where: { discountId: discount.id, userId },
      });
      if (userUsageCount >= discount.usageLimitPerUser) {
        return { discountAmount: 0, warning: "Bu kuponu zaten kullandınız" };
      }
    }

    // Calculate eligible amount based on scope
    let eligibleAmount = 0;
    const affectedProductIds: string[] = [];

    for (const item of items) {
      if (!item.isAvailable) continue;

      let isEligible = false;
      switch (discount.scope) {
        case DiscountScope.global:
          isEligible =
            discount.sellerId === null || discount.sellerId === item.sellerId;
          break;
        case DiscountScope.seller:
          isEligible = discount.sellerId === item.sellerId;
          break;
        case DiscountScope.product:
          isEligible = discount.targetProductIds.includes(item.productId);
          break;
        case DiscountScope.category:
          // For category scope, would need to check product category
          isEligible = discount.sellerId === null;
          break;
      }

      if (isEligible) {
        eligibleAmount += item.lineTotal;
        affectedProductIds.push(item.productId);
      }
    }

    if (eligibleAmount === 0) {
      return {
        discountAmount: 0,
        warning: "Bu kupon sepetinizdeki ürünlere uygulanamaz",
      };
    }

    // Check min cart value
    if (
      discount.minCartValue &&
      eligibleAmount < Number(discount.minCartValue)
    ) {
      return {
        discountAmount: 0,
        warning: `Minimum sepet tutarı: ${Number(discount.minCartValue).toFixed(2)} TL`,
      };
    }

    // Calculate discount
    let discountAmount = 0;
    if (discount.type === DiscountType.percentage) {
      discountAmount = eligibleAmount * (Number(discount.value) / 100);
    } else {
      discountAmount = Math.min(Number(discount.value), eligibleAmount);
    }

    // Apply max cap
    if (
      discount.maxDiscountAmount &&
      discountAmount > Number(discount.maxDiscountAmount)
    ) {
      discountAmount = Number(discount.maxDiscountAmount);
    }

    return {
      discountAmount,
      appliedDiscount: {
        discountId: discount.id,
        discountName: discount.name,
        discountCode: discount.code || undefined,
        type: discount.type,
        value: Number(discount.value),
        scope: discount.scope,
        appliedAmount: discountAmount,
        affectedProductIds,
      },
      isStackable: discount.isStackable,
    };
  }

  /**
   * Apply platform-wide auto campaigns
   */
  private async applyPlatformCampaigns(
    items: CalculatedCartItem[],
    subtotal: number,
    now: Date,
  ): Promise<{
    totalDiscount: number;
    appliedDiscounts: AppliedDiscount[];
  }> {
    const appliedDiscounts: AppliedDiscount[] = [];
    let totalDiscount = 0;

    const campaigns = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null,
        sellerId: null, // Platform only
        startDate: { lte: now },
        endDate: { gte: now },
        scope: { in: [DiscountScope.global, DiscountScope.category] },
      },
      orderBy: { priority: "asc" },
    });

    for (const campaign of campaigns) {
      // Check min cart value
      if (campaign.minCartValue && subtotal < Number(campaign.minCartValue)) {
        continue;
      }

      let discountAmount = 0;
      if (campaign.type === DiscountType.percentage) {
        discountAmount = subtotal * (Number(campaign.value) / 100);
      } else {
        discountAmount = Math.min(Number(campaign.value), subtotal);
      }

      // Apply max cap
      if (
        campaign.maxDiscountAmount &&
        discountAmount > Number(campaign.maxDiscountAmount)
      ) {
        discountAmount = Number(campaign.maxDiscountAmount);
      }

      if (discountAmount > 0) {
        totalDiscount += discountAmount;
        appliedDiscounts.push({
          discountId: campaign.id,
          discountName: campaign.name,
          type: campaign.type,
          value: Number(campaign.value),
          scope: campaign.scope,
          appliedAmount: discountAmount,
        });

        // Stop if not stackable
        if (!campaign.isStackable) break;
      }
    }

    return { totalDiscount, appliedDiscounts };
  }

  /**
   * Validate a product's discount eligibility (helper for product display)
   */
  /** A + oldPrice: effectivePrice = price (A) */
  async getProductEffectivePrice(productId: string): Promise<{
    originalPrice: number;
    effectivePrice: number;
    salePrice: number | null;
    discountPercent: number | null;
    isOnSale: boolean;
    saleEndDate: Date | null;
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error("Product not found");
    }

    const sale = resolveSalePrice(product, new Date());
    const effectivePrice = sale.price;
    const isOnSale = sale.isOnSale;
    const originalPrice = sale.oldPrice ?? effectivePrice;
    const discountPercent =
      isOnSale && originalPrice > effectivePrice
        ? Math.round(((originalPrice - effectivePrice) / originalPrice) * 100)
        : null;

    return {
      originalPrice,
      effectivePrice,
      salePrice: isOnSale ? effectivePrice : null,
      discountPercent,
      isOnSale,
      saleEndDate: isOnSale ? product.saleEndDate : null,
    };
  }
}
