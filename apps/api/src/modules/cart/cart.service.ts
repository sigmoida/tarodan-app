import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  ConflictException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { UserBlockService } from "../user-block/user-block.service";
import { DiscountService } from "../discount/discount.service";
import { isPublicStorageKey, StorageService } from "../storage/storage.service";
import {
  AddToCartDto,
  UpdateCartItemDto,
  ApplyCouponDto,
  CartResponseDto,
  CartCalculationResponseDto,
  CartItemResponseDto,
  AppliedDiscountDto,
} from "./dto";
import {
  ProductKind,
  ProductStatus,
  DiscountScope,
  DiscountTarget,
  Prisma,
} from "@prisma/client";
import { allocateCouponAcrossLines } from "../discount/engine/fee-discount.engine";
import {
  getAvailableQuantity,
  canAddRequestedQuantityToCart,
} from "../product/helpers/product-availability.helper";
import { ShippingTariffService } from "../shipping/tariff/shipping-tariff.service";
import {
  calculatePackageDesi,
  outboundPackageShipping,
  ShippingPackageTiersNotConfiguredError,
} from "../shipping/helpers/shipping-tariff.helper";
import { i18nMessage } from "../i18n";
import { canSellFromMembership } from "../membership/helpers/membership.util";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

// Cart expiry time: 24 hours
const CART_EXPIRY_HOURS = 24;

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discountService: DiscountService,
    private readonly shippingTariffs: ShippingTariffService,
    @Optional()
    private readonly storageService: StorageService,
    private readonly userBlocks: UserBlockService,
  ) {}

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
                images: { take: 1, orderBy: { sortOrder: "asc" } },
                seller: { select: this.saleEligibilitySellerSelect() },
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
                  images: { take: 1, orderBy: { sortOrder: "asc" } },
                  seller: { select: this.saleEligibilitySellerSelect() },
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
                  images: { take: 1, orderBy: { sortOrder: "asc" } },
                  seller: { select: this.saleEligibilitySellerSelect() },
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
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        seller: { select: this.saleEligibilitySellerSelect() },
      },
    });

    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    if (product.kind !== ProductKind.listing) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    if (product.status !== ProductStatus.active) {
      throw new BadRequestException(
        i18nMessage("server.cart.productNotPurchasable"),
      );
    }

    if (!canSellFromMembership(product.seller?.membership, product.seller)) {
      throw new ConflictException({
        code: "SELLER_SALES_SUSPENDED",
        productId: product.id,
        sellerId: product.sellerId,
        message: i18nMessage("server.commission.sellerSalesSuspended"),
      });
    }

    // Check if user is trying to buy their own product
    if (product.sellerId === userId) {
      throw new BadRequestException(
        i18nMessage("server.order.cannotBuyOwnProduct"),
      );
    }

    // Engelli çift alışveriş bağı kuramaz (ilan zaten 404; eski kart/derin link).
    await this.userBlocks.assertNotBlocked(
      userId,
      product.sellerId,
      "server.order.sellerBlocked",
    );

    // Sepet: fiziksel stok üst sınırı kontrolü
    if (!canAddRequestedQuantityToCart(product, dto.quantity || 1)) {
      throw new BadRequestException(
        product.quantity === 0
          ? "Ürün stokta yok"
          : `Bu üründen en fazla ${product.quantity} adet sipariş verilebilir`,
      );
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
      // Sepette ZATEN olan ürüne tekrar "Sepete Ekle": adet artırma denemesi, stok
      // ve sipariş-başına-maksimum üst sınırına GÜVENLİ biçimde sabitlenir — hata
      // fırlatmaz. Tekil (quantity=1) ürünlerde ekleme idempotenttir: zaten sepette
      // olan tek parça için ikinci ekleme no-op'tur. (Eski davranış newQuantity'yi
      // körlemesine +1 yapıp "en fazla 1 adet" hatası veriyordu; iptal sonrası kalan
      // bayat sepet satırıyla birleşince kullanıcıyı "tekrar sipariş veremiyorum"
      // sanısına düşürüyordu.)
      const requestedTotal = existingItem.quantity + (dto.quantity || 1);

      // Üst sınırlar: null stok = sınırsız (kısıt yok); maxQuantityPerOrder yoksa kısıt yok.
      const stockCap = product.quantity ?? requestedTotal;
      const perOrderCap = product.maxQuantityPerOrder ?? requestedTotal;
      const cappedQuantity = Math.min(requestedTotal, stockCap, perOrderCap);

      // Yalnızca gerçek artış varsa güncelle; aksi halde no-op (zaten sınırda / sepette).
      if (cappedQuantity > existingItem.quantity) {
        await this.prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: cappedQuantity },
        });
      }
    } else {
      // Check max quantity per order
      if (
        product.maxQuantityPerOrder &&
        (dto.quantity || 1) > product.maxQuantityPerOrder
      ) {
        throw new BadRequestException(
          i18nMessage("server.cart.maxQuantityPerOrder", {
            max: product.maxQuantityPerOrder,
          }),
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
      throw new NotFoundException(i18nMessage("server.cart.itemNotFound"));
    }

    if (dto.quantity === 0) {
      // Remove item
      await this.prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      // Check stock
      if (
        item.product.quantity !== null &&
        dto.quantity > item.product.quantity
      ) {
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
          i18nMessage("server.cart.maxQuantityPerOrder", {
            max: item.product.maxQuantityPerOrder,
          }),
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
  async removeItem(
    userId: string,
    productId: string,
  ): Promise<CartResponseDto> {
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
      throw new NotFoundException(i18nMessage("server.cart.itemNotFound"));
    }

    await this.prisma.cartItem.delete({ where: { id: item.id } });

    return this.getOrCreate(userId);
  }

  /**
   * Apply coupon code to cart
   */
  async applyCoupon(
    userId: string,
    dto: ApplyCouponDto,
  ): Promise<CartResponseDto> {
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
      throw new BadRequestException(i18nMessage("server.cart.empty"));
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
  async getCartWithCalculations(
    userId: string,
  ): Promise<CartCalculationResponseDto> {
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

  private saleEligibilitySellerSelect() {
    return {
      id: true,
      ...PUBLIC_NAME_SELECT,
      businessStatus: true,
      companyName: true,
      taxId: true,
      membership: {
        select: {
          status: true,
          currentPeriodEnd: true,
          tier: { select: { type: true, isActive: true } },
        },
      },
    } satisfies Prisma.UserSelect;
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
      const productDiscount = hasDiscount
        ? (originalPrice - effectivePrice) * item.quantity
        : 0;

      const available = getAvailableQuantity(product);
      const sellerCanSell = canSellFromMembership(
        product.seller?.membership,
        product.seller,
      );
      let isAvailable =
        product.kind === ProductKind.listing &&
        product.status === ProductStatus.active &&
        sellerCanSell;
      let stockWarning: string | undefined;

      if (!sellerCanSell) {
        stockWarning =
          "Satıcının kurumsal üyeliği geçerli olmadığı için bu ürün şu anda satın alınamıyor.";
      }

      if (sellerCanSell && available !== null) {
        if (available === 0) {
          isAvailable = false;
          stockWarning = "Stokta yok";
        } else if (available < item.quantity) {
          stockWarning = `Stokta sadece ${available} adet var`;
        } else if (available <= 5) {
          stockWarning = "Son birkaç ürün!";
        }
      }

      if (!isAvailable) {
        warnings.push(
          sellerCanSell
            ? `"${product.title}" artık satışta değil`
            : `"${product.title}": ${stockWarning}`,
        );
      } else {
        subtotal += lineTotal;
        productDiscountTotal += productDiscount;
      }

      // Resolve product image URL (S3 key -> presigned URL)
      const resolvedImage = this.resolveProductImageUrl(
        product.images?.[0]?.cardKey,
      );

      // Bu satırda sipariş edilebilecek üst sınır = fiziksel stok ∧ sipariş-başına-maks.
      // updateItem/addItem backend doğrulamasıyla BİREBİR aynı sınır (product.quantity +
      // maxQuantityPerOrder) → frontend + butonu tam backend'in kabul ettiği yerde durur.
      // İkisi de null ise (sınırsız stok, per-order limit yok) → undefined (üst sınır yok).
      const stockCap = product.quantity; // null = sınırsız
      const perOrderCap = product.maxQuantityPerOrder; // null = limit yok
      const maxQuantity =
        stockCap != null || perOrderCap != null
          ? Math.min(stockCap ?? Infinity, perOrderCap ?? Infinity)
          : undefined;

      items.push({
        id: item.id,
        productId: product.id,
        productTitle: product.title,
        productImage: resolvedImage,
        sellerId: product.sellerId,
        sellerName: publicName(product.seller),
        quantity: item.quantity,
        originalPrice,
        salePrice: hasDiscount ? effectivePrice : undefined,
        effectivePrice,
        lineTotal,
        productDiscount: productDiscount > 0 ? productDiscount : undefined,
        isAvailable,
        stockWarning,
        maxQuantity,
        shippingDesi: product.shippingDesi,
      });
    }

    const availableItems = items.filter((item) => item.isAvailable);

    // Apply coupon discount
    let couponDiscountTotal = 0;
    let couponIsStackable = true; // default: allow campaigns when no coupon
    if (cart.couponCode) {
      const couponResult = await this.applyCouponDiscount(
        cart.couponCode,
        availableItems,
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
    const totalDiscount = couponDiscountTotal + campaignDiscountTotal;
    // İndirim tavanı checkout ile AYNI kaynaktan: kupon tutarı
    // applyCouponDiscount içinde allocateCouponAcrossLines'tan (satır başına
    // %50 tavan) geçer → önizleme = tahsilat. Toplam yalnızca grandTotal'da
    // 0'a taban yapılır (Math.max(0, ...)).

    // Checkout ile aynı paket kuralı: aynı satıcının ürünleri tek paket, paket desisi
    // ürün desisi × adet toplamıdır. Böylece sepet özeti ile sipariş oluşturma aynı
    // aktif tarifeyi ve aynı satıcı-paketi sınırını kullanır.
    const hasAvailableItems = availableItems.length > 0;
    const tariff = await this.shippingTariffs.getActiveOutboundTariff();
    const sellerPackages = new Map<
      string,
      {
        subtotal: number;
        lines: Array<{ shippingDesi: number; quantity: number }>;
      }
    >();
    for (const item of availableItems) {
      const current = sellerPackages.get(item.sellerId) ?? {
        subtotal: 0,
        lines: [],
      };
      current.subtotal += item.lineTotal;
      current.lines.push({
        shippingDesi: item.shippingDesi,
        quantity: item.quantity,
      });
      sellerPackages.set(item.sellerId, current);
    }
    // Ücretsiz kargo eşiği KUPON ÖNCESİ paket tutarından değerlendirilir —
    // quote/checkout ile aynı kural (İ14): kupon kullanmak kazanılmış ücretsiz
    // kargoyu geri almaz. Eskiden kupon paket alt-toplamından düşülüp eşiğe
    // öyle bakılıyordu; sepet ekranı kargolu, tahsilat kargosuz gösteriyordu.
    let shippingCost = 0;
    let amountToFreeShipping = 0;
    try {
      for (const sellerPackage of sellerPackages.values()) {
        const packageShipping = outboundPackageShipping(
          tariff,
          sellerPackage.subtotal,
          calculatePackageDesi(sellerPackage.lines),
        ).toNumber();
        shippingCost += packageShipping;
        if (packageShipping > 0 && tariff.freeShippingEnabled) {
          amountToFreeShipping += Math.max(
            0,
            Number(tariff.freeShippingThreshold) - sellerPackage.subtotal,
          );
        }
      }
    } catch (error) {
      if (error instanceof ShippingPackageTiersNotConfiguredError) {
        throw new ServiceUnavailableException({
          code: "SHIPPING_PACKAGE_TIERS_NOT_CONFIGURED",
          message: error.message,
        });
      }
      throw error;
    }
    if (!hasAvailableItems) {
      shippingCost = 0;
      amountToFreeShipping = 0;
    }

    // Grand total
    const grandTotal = subtotal - totalDiscount + shippingCost;

    return {
      items,
      itemCount: availableItems.reduce((sum, i) => sum + i.quantity, 0),
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

  /**
   * Sepet kuponu — otoritatif kaynak checkout ile AYNI: DiscountService
   * .validateCoupon (voucher çözümü, iadeyle geri verilen hakkı sayan kullanım
   * limiti, kapsam/kitle/hedef kuralları) + allocateCouponAcrossLines (%50
   * tavan). Eskiden burada paralel bir kupon matematiği vardı: voucher kodları
   * "geçersiz" görünüyor, revoke edilmiş kullanım "zaten kullandınız"
   * sayılıyor ve bedel-hedefli kupon ürün tabanından iner gibi gösteriliyordu.
   */
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
      const validation = await this.discountService.validateCoupon(
        {
          code,
          cartItems: items
            .filter((item) => item.isAvailable)
            .map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
        },
        userId,
      );
      if (!validation.isValid || !validation.discount) {
        return {
          discountAmount: 0,
          warning: validation.error ?? "Kupon uygulanamadı",
        };
      }
      const coupon = validation.discount;

      // validateCoupon isStackable döndürmez; kampanya birlikteliği kararı için
      // yalnız bu bayrak okunur.
      const stackRow = await this.prisma.discount.findUnique({
        where: { id: coupon.id },
        select: { isStackable: true },
      });

      // Bedel hedefli kuponun tutarı ancak komisyon/kargo hesaplanınca bilinir;
      // sepette 0 görünür (CouponBox 0 tutarı gizler), quote/checkout gerçek
      // tutarı uygular. Ürün fiyatı kuponu ise checkout'la aynı dağıtım +
      // tavandan geçer.
      const isFeeCoupon = coupon.target !== DiscountTarget.product_price;
      let discountAmount = 0;
      if (!isFeeCoupon) {
        const eligibleSet = new Set(coupon.eligibleProductIds);
        const eligibleLines = items.filter(
          (item) => item.isAvailable && eligibleSet.has(item.productId),
        );
        discountAmount = allocateCouponAcrossLines(
          eligibleLines.map((item) => item.lineTotal),
          coupon.estimatedDiscount,
        ).total;
      }

      return {
        discountAmount,
        appliedDiscount: {
          discountId: coupon.id,
          discountName: coupon.name,
          discountCode: coupon.code || undefined,
          type: coupon.type,
          value: coupon.value,
          scope: coupon.scope,
          appliedAmount: discountAmount,
          affectedProductIds: coupon.eligibleProductIds,
        },
        couponIsStackable: stackRow?.isStackable ?? true,
      };
    } catch (error) {
      this.logger.error(`Error applying coupon: ${error}`);
      return { discountAmount: 0, warning: "Kupon uygulanırken hata oluştu" };
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
        orderBy: { priority: "asc" },
      });

      for (const campaign of campaigns) {
        if (
          campaign.minCartValue &&
          sellerSubtotal < Number(campaign.minCartValue)
        )
          continue;
        let discountAmount = 0;
        if (campaign.type === "percentage") {
          discountAmount = sellerSubtotal * (Number(campaign.value) / 100);
        } else {
          discountAmount = Math.min(Number(campaign.value), sellerSubtotal);
        }
        if (
          campaign.maxDiscountAmount &&
          discountAmount > Number(campaign.maxDiscountAmount)
        ) {
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
      orderBy: { priority: "asc" },
    });

    for (const campaign of campaigns) {
      // Check min cart value
      if (campaign.minCartValue && subtotal < Number(campaign.minCartValue)) {
        continue;
      }

      // Calculate discount
      let discountAmount = 0;
      if (campaign.type === "percentage") {
        discountAmount = subtotal * (Number(campaign.value) / 100);
      } else {
        discountAmount = Number(campaign.value);
      }

      // Apply max cap
      if (
        campaign.maxDiscountAmount &&
        discountAmount > Number(campaign.maxDiscountAmount)
      ) {
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
}
