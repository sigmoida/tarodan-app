import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { DiscountService } from '../discount/discount.service';
import { StorageService } from '../storage/storage.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  ApplyCouponDto,
  CartResponseDto,
  CartCalculationResponseDto,
  CartItemResponseDto,
  AppliedDiscountDto,
} from './dto';
import { ProductStatus, DiscountScope, Prisma } from '@prisma/client';

// Cart expiry time: 24 hours
const CART_EXPIRY_HOURS = 24;

// Shipping configuration
const FREE_SHIPPING_THRESHOLD = 500;
const BASE_SHIPPING_COST = 29.99;

// Max discount percentage
const MAX_DISCOUNT_PERCENT = 0.5; // 50%

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discountService: DiscountService,
    @Optional()
    private readonly storageService: StorageService,
  ) { }

  /**
   * Get or create a cart for user
   */
  async getOrCreate(userId: string): Promise<CartResponseDto> {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { sortOrder: 'asc' } },
                seller: { select: { id: true, displayName: true } },
              },
            },
          },
        },
      },
    });

    if (!cart) {
      // Create new cart
      cart = await this.prisma.cart.create({
        data: {
          userId,
          expiresAt: this.getNewExpiryDate(),
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: { take: 1, orderBy: { sortOrder: 'asc' } },
                  seller: { select: { id: true, displayName: true } },
                },
              },
            },
          },
        },
      });
    } else if (cart.expiresAt < new Date()) {
      // Cart expired, clear items and reset expiry
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      cart = await this.prisma.cart.update({
        where: { id: cart.id },
        data: {
          expiresAt: this.getNewExpiryDate(),
          couponCode: null,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: { take: 1, orderBy: { sortOrder: 'asc' } },
                  seller: { select: { id: true, displayName: true } },
                },
              },
            },
          },
        },
      });
    }

    return this.buildCartResponse(cart, userId);
  }

  /**
   * Add item to cart
   */
  async addItem(userId: string, dto: AddToCartDto): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);

    // Verify product exists and is available
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: {
        images: { take: 1, orderBy: { sortOrder: 'asc' } },
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.status !== ProductStatus.active) {
      throw new BadRequestException('Bu ürün şu an satışa uygun değil');
    }

    // Check if user is trying to buy their own product
    if (product.sellerId === userId) {
      throw new BadRequestException('Kendi ürününüzü satın alamazsınız');
    }

    // Check stock if quantity tracking is enabled
    if (product.quantity !== null && product.quantity < (dto.quantity || 1)) {
      throw new BadRequestException(`Stokta sadece ${product.quantity} adet var`);
    }

    // Check if item already in cart
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: dto.productId,
        },
      },
    });

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + (dto.quantity || 1);

      // Check max quantity per order
      if (product.maxQuantityPerOrder && newQuantity > product.maxQuantityPerOrder) {
        throw new BadRequestException(
          `Bu üründen maksimum ${product.maxQuantityPerOrder} adet alabilirsiniz`,
        );
      }

      // Check stock
      if (product.quantity !== null && newQuantity > product.quantity) {
        throw new BadRequestException(`Stokta sadece ${product.quantity} adet var`);
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      // Check max quantity per order
      if (product.maxQuantityPerOrder && (dto.quantity || 1) > product.maxQuantityPerOrder) {
        throw new BadRequestException(
          `Bu üründen maksimum ${product.maxQuantityPerOrder} adet alabilirsiniz`,
        );
      }

      // Add new item
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity || 1,
        },
      });
    }

    // Extend cart expiry
    await this.extendCartExpiry(cart.id);

    return this.getOrCreate(userId);
  }

  /**
   * Update cart item quantity
   */
  async updateItem(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
      include: { product: true },
    });

    if (!item) {
      throw new NotFoundException('Ürün sepette bulunamadı');
    }

    if (dto.quantity === 0) {
      // Remove item
      await this.prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      // Check stock
      if (item.product.quantity !== null && dto.quantity > item.product.quantity) {
        throw new BadRequestException(
          `Stokta sadece ${item.product.quantity} adet var`,
        );
      }

      // Check max quantity per order
      if (
        item.product.maxQuantityPerOrder &&
        dto.quantity > item.product.maxQuantityPerOrder
      ) {
        throw new BadRequestException(
          `Bu üründen maksimum ${item.product.maxQuantityPerOrder} adet alabilirsiniz`,
        );
      }

      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
      });
    }

    await this.extendCartExpiry(cart.id);

    return this.getOrCreate(userId);
  }

  /**
   * Remove item from cart
   */
  async removeItem(userId: string, productId: string): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Ürün sepette bulunamadı');
    }

    await this.prisma.cartItem.delete({ where: { id: item.id } });

    return this.getOrCreate(userId);
  }

  /**
   * Apply coupon code to cart
   */
  async applyCoupon(userId: string, dto: ApplyCouponDto): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);

    // Get cart items for validation
    const cartWithItems = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cartWithItems?.items.length) {
      throw new BadRequestException('Sepetiniz boş');
    }

    // Validate coupon
    const validation = await this.discountService.validateCoupon(
      {
        code: dto.code,
        cartItems: cartWithItems.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      },
      userId,
    );

    if (!validation.isValid) {
      throw new BadRequestException(validation.error);
    }

    // Apply coupon
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: dto.code.toUpperCase() },
    });

    return this.getOrCreate(userId);
  }

  /**
   * Remove coupon from cart
   */
  async removeCoupon(userId: string): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: null },
    });

    return this.getOrCreate(userId);
  }

  /**
   * Clear cart (remove all items)
   */
  async clearCart(userId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (cart) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: { couponCode: null },
      });
    }
  }

  /**
   * Get cart with full calculations (used by checkout)
   */
  async getCartWithCalculations(userId: string): Promise<CartCalculationResponseDto> {
    const cart = await this.getOrCreate(userId);
    return cart.calculation;
  }

  // Private helper methods

  private async getOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          userId,
          expiresAt: this.getNewExpiryDate(),
        },
      });
    }

    return cart;
  }

  private getNewExpiryDate(): Date {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + CART_EXPIRY_HOURS);
    return expiry;
  }

  private async extendCartExpiry(cartId: string): Promise<void> {
    await this.prisma.cart.update({
      where: { id: cartId },
      data: { expiresAt: this.getNewExpiryDate() },
    });
  }

  private async buildCartResponse(
    cart: any,
    userId: string,
  ): Promise<CartResponseDto> {
    const calculation = await this.calculateCart(cart, userId);

    return {
      id: cart.id,
      userId: cart.userId,
      couponCode: cart.couponCode,
      expiresAt: cart.expiresAt,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      calculation,
    };
  }

  private async calculateCart(
    cart: any,
    userId: string,
  ): Promise<CartCalculationResponseDto> {
    const now = new Date();
    const items: CartItemResponseDto[] = [];
    const appliedDiscounts: AppliedDiscountDto[] = [];
    const warnings: string[] = [];

    let subtotal = 0;
    let productDiscountTotal = 0;

    // Calculate effective prices with campaign discounts
    for (const item of cart.items || []) {
      const product = item.product;
      const basePrice = Number(product.price);

      // Get campaign discount price from DiscountService
      const campaignPrice = await this.discountService.getEffectiveDisplayPrice(
        product.id,
        product.sellerId,
        product.categoryId,
        basePrice,
      );

      // Use campaign price if available, otherwise base price
      const effectivePrice = campaignPrice ?? basePrice;
      const originalPrice = basePrice; // Original is always the base price
      const hasDiscount = effectivePrice < originalPrice;

      const lineTotal = effectivePrice * item.quantity;
      const productDiscount = hasDiscount ? (originalPrice - effectivePrice) * item.quantity : 0;

      subtotal += lineTotal;
      productDiscountTotal += productDiscount;

      let isAvailable = product.status === ProductStatus.active;
      let stockWarning: string | undefined;

      if (product.quantity !== null) {
        if (product.quantity === 0) {
          isAvailable = false;
          stockWarning = 'Stokta yok';
        } else if (product.quantity < item.quantity) {
          stockWarning = `Stokta sadece ${product.quantity} adet var`;
        } else if (product.quantity <= 5) {
          stockWarning = 'Son birkaç ürün!';
        }
      }

      if (!isAvailable) {
        warnings.push(`"${product.title}" artık satışta değil`);
      }

      // Resolve product image URL (S3 key -> presigned URL)
      const resolvedImage = this.resolveProductImageUrl(product.images?.[0]?.cardKey);

      items.push({
        id: item.id,
        productId: product.id,
        productTitle: product.title,
        productImage: resolvedImage,
        sellerId: product.sellerId,
        sellerName: product.seller?.displayName || 'Satıcı',
        quantity: item.quantity,
        originalPrice,
        salePrice: hasDiscount ? effectivePrice : undefined,
        effectivePrice,
        lineTotal,
        productDiscount: productDiscount > 0 ? productDiscount : undefined,
        isAvailable,
        stockWarning,
      });
    }

    // Apply coupon discount
    let couponDiscountTotal = 0;
    let couponIsStackable = true; // default: allow campaigns when no coupon
    if (cart.couponCode) {
      const couponResult = await this.applyCouponDiscount(
        cart.couponCode,
        items,
        userId,
      );
      couponDiscountTotal = couponResult.discountAmount;
      if (couponResult.appliedDiscount) {
        appliedDiscounts.push(couponResult.appliedDiscount);
        couponIsStackable = couponResult.couponIsStackable ?? true;
      }
      if (couponResult.warning) {
        warnings.push(couponResult.warning);
      }
    }

    // Kodsuz (otomatik) indirim işlevi kaldırıldı – sadece kupon kodu ile indirim uygulanır
    const campaignDiscountTotal = 0;

    // Calculate total discount for grandTotal
    // NOTE: productDiscountTotal is DISPLAY ONLY - shows how much customer saved
    // The subtotal already uses discounted prices (effectivePrice), so we only subtract:
    // - couponDiscountTotal: additional coupon discount on top of current prices
    // - campaignDiscountTotal: (currently 0, campaigns reflected in effectivePrice)
    let totalDiscount = couponDiscountTotal + campaignDiscountTotal;

    // Apply max discount cap (50% of original subtotal)
    const originalSubtotal = items.reduce(
      (sum, i) => sum + i.originalPrice * i.quantity,
      0,
    );
    const maxDiscount = originalSubtotal * MAX_DISCOUNT_PERCENT;
    if (totalDiscount > maxDiscount) {
      totalDiscount = maxDiscount;
      warnings.push('Maksimum indirim limitine ulaşıldı (%50)');
    }

    // Calculate shipping
    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : BASE_SHIPPING_COST;
    const amountToFreeShipping =
      subtotal >= FREE_SHIPPING_THRESHOLD
        ? 0
        : FREE_SHIPPING_THRESHOLD - subtotal;

    // Grand total
    const grandTotal = subtotal - totalDiscount + shippingCost;

    return {
      items,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal,
      productDiscountTotal,
      couponDiscountTotal,
      campaignDiscountTotal,
      totalDiscount,
      shippingCost,
      amountToFreeShipping,
      grandTotal: Math.max(0, grandTotal),
      appliedCouponCode: cart.couponCode,
      appliedDiscounts,
      warnings,
    };
  }

  private isSaleActive(product: any, now: Date): boolean {
    if (product.oldPrice == null) return false;
    if (product.saleStartDate && now < product.saleStartDate) return false;
    if (product.saleEndDate && now > product.saleEndDate) return false;
    return true;
  }

  private async applyCouponDiscount(
    code: string,
    items: CartItemResponseDto[],
    userId: string,
  ): Promise<{
    discountAmount: number;
    appliedDiscount?: AppliedDiscountDto;
    warning?: string;
    couponIsStackable?: boolean;
  }> {
    try {
      const discount = await this.prisma.discount.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (!discount || !discount.isActive) {
        return { discountAmount: 0, warning: 'Kupon artık geçerli değil' };
      }

      const now = new Date();
      if (now < discount.startDate || now > discount.endDate) {
        return { discountAmount: 0, warning: 'Kuponun süresi doldu' };
      }

      // Check usage limits
      const canUse = await this.discountService.checkUsageLimit(discount.id, userId);
      if (!canUse) {
        return { discountAmount: 0, warning: 'Bu kuponu zaten kullandınız' };
      }

      // Calculate discount based on scope
      let eligibleAmount = 0;
      const affectedProductIds: string[] = [];

      for (const item of items) {
        if (!item.isAvailable) continue;

        let isEligible = false;

        switch (discount.scope) {
          case DiscountScope.global:
            isEligible = discount.sellerId === null || discount.sellerId === item.sellerId;
            break;
          case DiscountScope.seller:
            isEligible = discount.sellerId === item.sellerId;
            break;
          case DiscountScope.product:
            isEligible = discount.targetProductIds.includes(item.productId);
            break;
          case DiscountScope.category:
            // Would need to check product's category
            isEligible = discount.sellerId === null;
            break;
        }

        if (isEligible) {
          eligibleAmount += item.lineTotal;
          affectedProductIds.push(item.productId);
        }
      }

      if (eligibleAmount === 0) {
        return { discountAmount: 0, warning: 'Bu kupon sepetinizdeki ürünlere uygulanamaz' };
      }

      // Check minimum cart value
      if (discount.minCartValue && eligibleAmount < Number(discount.minCartValue)) {
        return {
          discountAmount: 0,
          warning: `Minimum sepet tutarı: ${Number(discount.minCartValue).toFixed(2)} TL`,
        };
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (discount.type === 'percentage') {
        discountAmount = eligibleAmount * (Number(discount.value) / 100);
      } else {
        discountAmount = Number(discount.value);
      }

      // Apply max discount cap
      if (discount.maxDiscountAmount && discountAmount > Number(discount.maxDiscountAmount)) {
        discountAmount = Number(discount.maxDiscountAmount);
      }

      // Don't exceed eligible amount
      discountAmount = Math.min(discountAmount, eligibleAmount);

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
        couponIsStackable: discount.isStackable,
      };
    } catch (error) {
      this.logger.error(`Error applying coupon: ${error}`);
      return { discountAmount: 0, warning: 'Kupon uygulanırken hata oluştu' };
    }
  }

  /**
   * Apply seller-scoped auto campaigns (code=null, scope=seller).
   * Admin oluşturduğu kodsuz satıcı kampanyaları (sellerId=null = tüm satıcılara) veya belirli satıcıya özel kampanyalar.
   */
  private async applySellerAutoCampaigns(
    items: CartItemResponseDto[],
  ): Promise<{
    discountAmount: number;
    appliedDiscounts: AppliedDiscountDto[];
  }> {
    const now = new Date();
    const appliedDiscounts: AppliedDiscountDto[] = [];
    let totalDiscountAmount = 0;

    const sellerGroups = new Map<string, CartItemResponseDto[]>();
    for (const item of items) {
      if (!item.isAvailable) continue;
      const group = sellerGroups.get(item.sellerId) || [];
      group.push(item);
      sellerGroups.set(item.sellerId, group);
    }

    for (const [sellerId, sellerItems] of sellerGroups) {
      const sellerSubtotal = sellerItems.reduce((s, i) => s + i.lineTotal, 0);
      const campaigns = await this.prisma.discount.findMany({
        where: {
          isActive: true,
          code: null,
          scope: DiscountScope.seller,
          OR: [{ sellerId }, { sellerId: null }],
          startDate: { lte: now },
          endDate: { gte: now },
        },
        orderBy: { priority: 'asc' },
      });

      for (const campaign of campaigns) {
        if (campaign.minCartValue && sellerSubtotal < Number(campaign.minCartValue)) continue;
        let discountAmount = 0;
        if (campaign.type === 'percentage') {
          discountAmount = sellerSubtotal * (Number(campaign.value) / 100);
        } else {
          discountAmount = Math.min(Number(campaign.value), sellerSubtotal);
        }
        if (campaign.maxDiscountAmount && discountAmount > Number(campaign.maxDiscountAmount)) {
          discountAmount = Number(campaign.maxDiscountAmount);
        }
        if (discountAmount > 0) {
          totalDiscountAmount += discountAmount;
          appliedDiscounts.push({
            discountId: campaign.id,
            discountName: campaign.name,
            type: campaign.type,
            value: Number(campaign.value),
            scope: campaign.scope,
            appliedAmount: discountAmount,
          });
          if (!campaign.isStackable) break;
        }
      }
    }

    return { discountAmount: totalDiscountAmount, appliedDiscounts };
  }

  private async applyAutoCampaigns(
    items: CartItemResponseDto[],
    subtotal: number,
  ): Promise<{
    discountAmount: number;
    appliedDiscounts: AppliedDiscountDto[];
  }> {
    const now = new Date();
    const appliedDiscounts: AppliedDiscountDto[] = [];
    let totalDiscountAmount = 0;

    // Get active auto campaigns (no coupon code) – platform only (scope global/category)
    const campaigns = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null,
        sellerId: null,
        startDate: { lte: now },
        endDate: { gte: now },
        scope: { in: [DiscountScope.global, DiscountScope.category] },
      },
      orderBy: { priority: 'asc' },
    });

    for (const campaign of campaigns) {
      // Check min cart value
      if (campaign.minCartValue && subtotal < Number(campaign.minCartValue)) {
        continue;
      }

      // Calculate discount
      let discountAmount = 0;
      if (campaign.type === 'percentage') {
        discountAmount = subtotal * (Number(campaign.value) / 100);
      } else {
        discountAmount = Number(campaign.value);
      }

      // Apply max cap
      if (campaign.maxDiscountAmount && discountAmount > Number(campaign.maxDiscountAmount)) {
        discountAmount = Number(campaign.maxDiscountAmount);
      }

      if (discountAmount > 0) {
        totalDiscountAmount += discountAmount;
        appliedDiscounts.push({
          discountId: campaign.id,
          discountName: campaign.name,
          type: campaign.type,
          value: Number(campaign.value),
          scope: campaign.scope,
          appliedAmount: discountAmount,
        });

        // If not stackable, stop after first campaign
        if (!campaign.isStackable) {
          break;
        }
      }
    }

    return {
      discountAmount: totalDiscountAmount,
      appliedDiscounts,
    };
  }

  /**
   * Resolve product image URL (S3 key -> presigned URL)
   */
  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    if (imageKeyOrUrl.includes('dev/') || imageKeyOrUrl.includes('prod/')) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }
}
