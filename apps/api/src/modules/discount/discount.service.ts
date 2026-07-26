import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { fulltextDiscountSearch } from "../../common/helpers/fulltext-search";
import { resolveOrderBy } from "../../common/list";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
  ValidateCouponDto,
  DiscountResponseDto,
  PaginatedDiscountsDto,
  ValidationResultDto,
  ActiveCampaignDto,
} from "./dto";
import { DiscountScope, Prisma } from "@prisma/client";

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * İndirim değişince ürün listesi/detay cache'lerini temizle (fiyatlar kampanyaya göre hesaplanıyor)
   */
  private async invalidateProductCaches(): Promise<void> {
    try {
      const listCount = await this.cache.delPattern("products:list:*");
      const detailCount = await this.cache.delPattern("products:detail:*");
      if (listCount > 0 || detailCount > 0) {
        this.logger.log(
          `Product cache invalidated: ${listCount} list keys, ${detailCount} detail keys`,
        );
      }
    } catch (e) {
      this.logger.warn("Product cache invalidation failed", e);
    }
  }

  /**
   * Create a new discount
   * @param dto - Discount creation data
   * @param actorId - User ID creating the discount (NULL for admin)
   * @param isAdmin - Is the actor an admin?
   */
  async create(
    dto: CreateDiscountDto,
    actorId: string | null,
    isAdmin: boolean,
  ): Promise<DiscountResponseDto> {
    // Sellers can only create discounts for their own products
    if (!isAdmin && dto.scope === DiscountScope.global) {
      throw new ForbiddenException("Satıcılar global indirim oluşturamazlar");
    }

    if (!isAdmin && dto.scope === DiscountScope.category) {
      throw new ForbiddenException(
        "Satıcılar kategori indirimi oluşturamazlar",
      );
    }

    // Validate category exists if scope is category
    if (dto.scope === DiscountScope.category && dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException("Kategori bulunamadı");
      }
    }

    // Scope=product: hedef ürün listesi zorunlu (seçili ürünler)
    if (dto.scope === DiscountScope.product) {
      if (!dto.targetProductIds?.length) {
        throw new BadRequestException(
          "Seçili ürünler kapsamı için en az bir ürün seçmelisiniz",
        );
      }
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: dto.targetProductIds },
          ...(actorId && !isAdmin ? { sellerId: actorId } : {}),
        },
      });
      if (products.length !== dto.targetProductIds.length) {
        throw new BadRequestException(
          isAdmin
            ? "Bazı ürünler bulunamadı"
            : "Sadece kendi ürünleriniz için indirim oluşturabilirsiniz",
        );
      }
    }

    // Scope=seller: tüm mağaza; targetProductIds kullanılmaz (boş kaydedilir)
    if (dto.scope === DiscountScope.seller) {
      dto.targetProductIds = [];
    }

    // Check for duplicate coupon code
    if (dto.code) {
      const existing = await this.prisma.discount.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new BadRequestException("Bu kupon kodu zaten kullanılıyor");
      }
    }

    const discount = await this.prisma.discount.create({
      data: {
        code: dto.code?.toUpperCase() || null,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        scope: dto.scope,
        sellerId: isAdmin ? null : actorId,
        categoryId: dto.categoryId || null,
        targetProductIds: dto.targetProductIds || [],
        minCartValue: dto.minCartValue
          ? new Prisma.Decimal(dto.minCartValue)
          : null,
        maxDiscountAmount: dto.maxDiscountAmount
          ? new Prisma.Decimal(dto.maxDiscountAmount)
          : null,
        usageLimitTotal: dto.usageLimitTotal || null,
        usageLimitPerUser: dto.usageLimitPerUser || 1,
        minQuantity: dto.minQuantity || null,
        buyQuantity: dto.buyQuantity || null,
        getQuantity: dto.getQuantity || null,
        isFlashSale: dto.isFlashSale ?? false,
        isStackable: dto.isStackable ?? false,

        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `Discount created: ${discount.id} by ${isAdmin ? "admin" : actorId}`,
    );

    await this.invalidateProductCaches();
    return this.mapToResponse(discount);
  }

  /**
   * Update an existing discount
   */
  async update(
    id: string,
    dto: UpdateDiscountDto,
    actorId: string | null,
    isAdmin: boolean,
  ): Promise<DiscountResponseDto> {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
    });

    if (!discount) {
      throw new NotFoundException("İndirim bulunamadı");
    }

    // Sellers can only update their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException("Bu indirimi düzenleme yetkiniz yok");
    }

    // Check code uniqueness if changing
    if (dto.code && dto.code !== discount.code) {
      const existing = await this.prisma.discount.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new BadRequestException("Bu kupon kodu zaten kullanılıyor");
      }
    }

    // Scope=product kaldığı veya product yapıldığında hedef ürün listesi boş olamaz
    const newScope = dto.scope ?? discount.scope;
    if (newScope === DiscountScope.product && !isAdmin) {
      const newIds =
        dto.scope === DiscountScope.seller
          ? []
          : (dto.targetProductIds ?? discount.targetProductIds ?? []);
      if (!newIds.length) {
        throw new BadRequestException(
          "Seçili ürünler kapsamı için en az bir ürün seçmelisiniz",
        );
      }
    }

    // Kapsam değişince: seller ise targetProductIds temizle; product ise dto.targetProductIds kullan
    const updateData: Prisma.DiscountUpdateInput = {
      ...(dto.code !== undefined && { code: dto.code?.toUpperCase() || null }),
      ...(dto.name && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.type && { type: dto.type }),
      ...(dto.value !== undefined && {
        value: new Prisma.Decimal(dto.value),
      }),
      ...(dto.scope && { scope: dto.scope }),
      ...(dto.scope === DiscountScope.seller && { targetProductIds: [] }),
      ...(dto.targetProductIds !== undefined && {
        targetProductIds: dto.targetProductIds,
      }),
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      ...(dto.minCartValue !== undefined && {
        minCartValue: dto.minCartValue
          ? new Prisma.Decimal(dto.minCartValue)
          : null,
      }),
      ...(dto.maxDiscountAmount !== undefined && {
        maxDiscountAmount: dto.maxDiscountAmount
          ? new Prisma.Decimal(dto.maxDiscountAmount)
          : null,
      }),
      ...(dto.usageLimitTotal !== undefined && {
        usageLimitTotal: dto.usageLimitTotal,
      }),
      ...(dto.usageLimitPerUser !== undefined && {
        usageLimitPerUser: dto.usageLimitPerUser,
      }),
      ...(dto.minQuantity !== undefined && {
        minQuantity: dto.minQuantity,
      }),
      ...(dto.buyQuantity !== undefined && {
        buyQuantity: dto.buyQuantity,
      }),
      ...(dto.getQuantity !== undefined && {
        getQuantity: dto.getQuantity,
      }),
      ...(dto.isFlashSale !== undefined && { isFlashSale: dto.isFlashSale }),
      ...(dto.isStackable !== undefined && { isStackable: dto.isStackable }),

      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.startDate && { startDate: new Date(dto.startDate) }),
      ...(dto.endDate && { endDate: new Date(dto.endDate) }),
    };

    const updated = await this.prisma.discount.update({
      where: { id },
      data: updateData,
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    this.logger.log(`Discount updated: ${id}`);

    await this.invalidateProductCaches();
    return this.mapToResponse(updated);
  }

  /**
   * Delete a discount
   */
  async delete(
    id: string,
    actorId: string | null,
    isAdmin: boolean,
  ): Promise<void> {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
    });

    if (!discount) {
      throw new NotFoundException("İndirim bulunamadı");
    }

    // Sellers can only delete their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException("Bu indirimi silme yetkiniz yok");
    }

    await this.prisma.discount.delete({ where: { id } });
    this.logger.log(`Discount deleted: ${id}`);
    await this.invalidateProductCaches();
  }

  /**
   * Get discount by ID
   */
  async findOne(
    id: string,
    actorId: string | null,
    isAdmin: boolean,
  ): Promise<DiscountResponseDto> {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    if (!discount) {
      throw new NotFoundException("İndirim bulunamadı");
    }

    // Sellers can only view their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException("Bu indirimi görüntüleme yetkiniz yok");
    }

    return this.mapToResponse(discount);
  }

  /**
   * Find discount by coupon code
   */
  async findByCode(code: string): Promise<DiscountResponseDto | null> {
    const discount = await this.prisma.discount.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    return discount ? this.mapToResponse(discount) : null;
  }

  /**
   * List discounts with pagination and filters
   */
  async findAll(
    query: DiscountQueryDto,
    actorId: string | null,
    isAdmin: boolean,
  ): Promise<PaginatedDiscountsDto> {
    const {
      page = 1,
      limit = 20,
      search,
      scope,
      isActive,
      sellerId,
      couponsOnly,
      autoOnly,
      sortBy = "created_desc",
      sortOrder,
      sortType,
    } = query;

    const where: Prisma.DiscountWhereInput = {
      ...(isAdmin ? (sellerId ? { sellerId } : {}) : { sellerId: actorId }),
      ...(scope && { scope }),
      ...(isActive !== undefined && { isActive }),
      ...(couponsOnly && { code: { not: null } }),
      ...(autoOnly && { code: null }),
    };

    if (search) {
      const ids = await fulltextDiscountSearch(this.prisma, search);
      const normalized = search.trim().toLowerCase();
      const numeric = Number(search.replace(",", "."));
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { seller: { displayName: { contains: search, mode: "insensitive" } } },
        { category: { name: { contains: search, mode: "insensitive" } } },
      ];
      if (ids.length > 0) where.OR.push({ id: { in: ids } });
      if (Number.isFinite(numeric))
        where.OR.push({ value: numeric }, { usedCount: Math.trunc(numeric) });
      if (Object.values(DiscountScope).includes(normalized as DiscountScope))
        where.OR.push({ scope: normalized as DiscountScope });
      if (["true", "active", "aktif"].includes(normalized))
        where.OR.push({ isActive: true });
      if (["false", "inactive", "pasif"].includes(normalized))
        where.OR.push({ isActive: false });
    }

    const orderBy = resolveOrderBy<Prisma.DiscountOrderByWithRelationInput>(
      "Discount",
      { sortBy, sortOrder, sortType },
      {
        defaultSort: { createdAt: "desc" },
        // Legacy combined tokens stay supported; standard column keys resolve
        // via the DMMF (name, code, scope, usedCount, startDate, isActive, …).
        sortMap: {
          created_asc: () => ({ createdAt: "asc" }),
          created_desc: () => ({ createdAt: "desc" }),
          name_asc: () => ({ name: "asc" }),
          name_desc: () => ({ name: "desc" }),
          priority_asc: () => ({ priority: "asc" }),
        },
      },
    );

    const [items, total] = await Promise.all([
      this.prisma.discount.findMany({
        where,
        include: {
          seller: { select: { id: true, displayName: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.discount.count({ where }),
    ]);

    return {
      items: items.map((d) => this.mapToResponse(d)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Validate a coupon code
   */
  async validateCoupon(
    dto: ValidateCouponDto,
    userId: string,
  ): Promise<ValidationResultDto> {
    const code = dto.code.toUpperCase();
    const sellerCategoryInclude = {
      seller: { select: { id: true, displayName: true } },
      category: { select: { id: true, name: true } },
    };

    let discount = await this.prisma.discount.findUnique({
      where: { code },
      include: sellerCategoryInclude,
    });

    // Voucher (tek-kullanımlık) kodu: paylaşımlı Discount.code bulunamazsa
    // DiscountCode tablosuna bak → parent Discount kuralları geçerli, ek olarak
    // kod tek kullanımlıktır (isRedeemed).
    let voucherCodeId: string | undefined;
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
    }

    if (!discount.isActive) {
      return { isValid: false, error: "Bu kupon artık aktif değil" };
    }

    const now = new Date();
    if (now < discount.startDate) {
      return { isValid: false, error: "Bu kupon henüz başlamadı" };
    }

    if (now > discount.endDate) {
      return { isValid: false, error: "Bu kuponun süresi doldu" };
    }

    // Check total usage limit
    if (
      discount.usageLimitTotal &&
      discount.usedCount >= discount.usageLimitTotal
    ) {
      return { isValid: false, error: "Bu kupon kullanım limitine ulaştı" };
    }

    // Check per-user usage limit
    if (discount.usageLimitPerUser) {
      const userUsageCount = await this.prisma.discountUsage.count({
        where: { discountId: discount.id, userId },
      });
      if (userUsageCount >= discount.usageLimitPerUser) {
        return {
          isValid: false,
          error: "Bu kuponu zaten kullandınız",
        };
      }
    }

    // Calculate estimated discount based on cart
    let estimatedDiscount = 0;
    let cartTotal = 0;

    if (dto.cartItems?.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: dto.cartItems.map((i) => i.productId) } },
      });

      for (const item of dto.cartItems) {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          const itemPrice = Number(product.price) * item.quantity;
          cartTotal += itemPrice;

          // Check if this item is eligible for the discount
          const isEligible = this.isProductEligibleForDiscount(
            product,
            discount,
          );
          if (isEligible) {
            if (discount.type === "percentage") {
              estimatedDiscount += itemPrice * (Number(discount.value) / 100);
            } else {
              estimatedDiscount += Number(discount.value);
            }
          }
        }
      }
    }

    // Check minimum cart value
    if (discount.minCartValue && cartTotal < Number(discount.minCartValue)) {
      return {
        isValid: false,
        error: `Minimum sepet tutarı: ${Number(discount.minCartValue).toFixed(2)} TL`,
      };
    }

    // Apply max discount cap
    if (
      discount.maxDiscountAmount &&
      estimatedDiscount > Number(discount.maxDiscountAmount)
    ) {
      estimatedDiscount = Number(discount.maxDiscountAmount);
    }

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
        voucherCodeId,
      },
    };
  }

  /**
   * Check user's usage of a specific discount
   */
  async checkUsageLimit(discountId: string, userId: string): Promise<boolean> {
    const discount = await this.prisma.discount.findUnique({
      where: { id: discountId },
    });

    if (!discount || !discount.usageLimitPerUser) {
      return true;
    }

    const usageCount = await this.prisma.discountUsage.count({
      where: { discountId, userId },
    });

    return usageCount < discount.usageLimitPerUser;
  }

  /**
   * Record discount usage after order completion.
   *
   * @param voucherCodeId - Tek-kullanımlık voucher kodu ise ilgili DiscountCode
   *   id'si. Verilirse kod ATOMİK olarak "kullanıldı" işaretlenir (zaten
   *   kullanılmışsa throw) → aynı voucher iki siparişte kullanılamaz.
   */
  async recordUsage(
    discountId: string,
    userId: string,
    orderId: string,
    amount: number,
    voucherCodeId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (voucherCodeId) {
        // Atomik tek-kullanım: yalnızca henüz kullanılmamışsa işaretle.
        const claimed = await tx.discountCode.updateMany({
          where: { id: voucherCodeId, isRedeemed: false },
          data: {
            isRedeemed: true,
            redeemedById: userId,
            redeemedAt: new Date(),
            orderId,
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException("Bu kupon kodu daha önce kullanıldı");
        }
      }
      await tx.discountUsage.create({
        data: {
          discountId,
          userId,
          orderId,
          amount: new Prisma.Decimal(amount),
        },
      });
      await tx.discount.update({
        where: { id: discountId },
        data: { usedCount: { increment: 1 } },
      });
    });

    this.logger.log(
      `Discount usage recorded: ${discountId} by ${userId} for order ${orderId}`,
    );
  }

  /**
   * Toplu voucher kodu üret: parent Discount (şablon) altında N adet benzersiz
   * tek-kullanımlık kod. Çakışma-güvenli (unique index + toplu dene, çakışanları
   * yeniden üret). Parent `isBatch` işaretlenir.
   */
  async generateCodes(
    discountId: string,
    count: number,
    prefix?: string,
  ): Promise<{ generated: number; total: number }> {
    const discount = await this.prisma.discount.findUnique({
      where: { id: discountId },
      select: { id: true },
    });
    if (!discount) throw new NotFoundException("İndirim bulunamadı");
    if (count < 1 || count > 10000) {
      throw new BadRequestException("Kod adedi 1 ile 10000 arasında olmalı");
    }

    const cleanPrefix = (prefix ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);

    let generated = 0;
    let guard = 0;
    while (generated < count && guard < 50) {
      guard += 1;
      const need = count - generated;
      const candidates = new Set<string>();
      while (candidates.size < need) {
        candidates.add(this.randomVoucherCode(cleanPrefix));
      }
      const res = await this.prisma.discountCode.createMany({
        data: Array.from(candidates).map((c) => ({ discountId, code: c })),
        skipDuplicates: true, // unique çakışmalar sessizce atlanır → döngü tekrar dener
      });
      generated += res.count;
    }

    await this.prisma.discount.update({
      where: { id: discountId },
      data: { isBatch: true },
    });

    const total = await this.prisma.discountCode.count({
      where: { discountId },
    });
    this.logger.log(`Generated ${generated} voucher codes for ${discountId}`);
    return { generated, total };
  }

  /** URL/insan dostu benzersiz-olması muhtemel kod (çakışma DB'de yakalanır). */
  private randomVoucherCode(prefix: string): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O, 1/I çıkarıldı
    let body = "";
    for (let i = 0; i < 10; i += 1) {
      body += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return prefix ? `${prefix}-${body}` : body;
  }

  /** Bir batch'in kodları (admin listeleme + CSV export). */
  async listCodes(discountId: string) {
    const codes = await this.prisma.discountCode.findMany({
      where: { discountId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        isRedeemed: true,
        redeemedById: true,
        redeemedAt: true,
        orderId: true,
        createdAt: true,
      },
    });
    return {
      data: codes,
      meta: {
        total: codes.length,
        redeemed: codes.filter((c) => c.isRedeemed).length,
      },
    };
  }

  /**
   * Get the best effective display price for a product from active auto-applied campaigns.
   * Used by product listing/detail to show campaign discount on the product card.
   * @returns The lowest price from applicable campaigns, or null if none apply
   */
  async getEffectiveDisplayPrice(
    productId: string,
    sellerId: string,
    categoryId: string,
    currentDisplayPrice: number,
  ): Promise<number | null> {
    // Tek ürün = tek-elemanlı batch. Matematik ve DB filtresi tek otoritede
    // (getEffectiveDisplayPriceMany) → liste ile drift imkânsız.
    const map = await this.getEffectiveDisplayPriceMany([
      { productId, sellerId, categoryId, currentDisplayPrice },
    ]);
    return map.get(productId) ?? null;
  }

  /**
   * N+1 giderme (#67): Bir sayfadaki tüm ürünler için etkin kampanya fiyatını TEK
   * discount.findMany ile çözer. Aktif auto-discount'lar (kampanyalar) az sayıdadır;
   * hepsini bir kez çekip her ürün için uygunluğu BELLEKTE değerlendiririz — best-price
   * hesabı getEffectiveDisplayPrice'ın birebir aynısıdır (yalnız kaynak sorgu toplu).
   * Dönen map: productId → indirimli görüntü fiyatı (indirim yoksa null).
   */
  async getEffectiveDisplayPriceMany(
    items: {
      productId: string;
      sellerId: string;
      categoryId: string;
      currentDisplayPrice: number;
    }[],
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>();
    if (!items.length) return result;

    const now = new Date();
    const sellerIds = [
      ...new Set(items.map((i) => i.sellerId).filter(Boolean)),
    ];
    const categoryIds = [
      ...new Set(items.map((i) => i.categoryId).filter(Boolean)),
    ];
    const productIds = items.map((i) => i.productId);

    const discounts = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { scope: DiscountScope.global, sellerId: null },
          { scope: DiscountScope.seller, sellerId: { in: sellerIds } },
          { scope: DiscountScope.category, categoryId: { in: categoryIds } },
          {
            scope: DiscountScope.product,
            targetProductIds: { hasSome: productIds },
          },
        ],
      },
      orderBy: { priority: "asc" },
    });

    for (const item of items) {
      const { productId, sellerId, categoryId, currentDisplayPrice } = item;
      const product = { id: productId, sellerId, categoryId };
      let bestPrice: number | null = null;
      for (const d of discounts) {
        if (!this.isProductEligibleForDiscount(product, d)) continue;

        let effectivePrice: number;
        if (d.type === "percentage") {
          const discountAmount = currentDisplayPrice * (Number(d.value) / 100);
          const capped =
            d.maxDiscountAmount != null
              ? Math.min(discountAmount, Number(d.maxDiscountAmount))
              : discountAmount;
          effectivePrice = Math.max(0, currentDisplayPrice - capped);
        } else {
          effectivePrice = Math.max(
            0,
            currentDisplayPrice -
              Math.min(Number(d.value), currentDisplayPrice),
          );
        }
        if (effectivePrice < currentDisplayPrice) {
          if (bestPrice == null || effectivePrice < bestPrice) {
            bestPrice = effectivePrice;
          }
        }
      }
      result.set(productId, bestPrice);
    }
    return result;
  }

  /**
   * Get criteria for all currently active auto-applied discounts.
   * Used for filtering products in findAll.
   */
  async getActiveDiscountCriteria() {
    const now = new Date();
    const activeDiscounts = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null, // Only auto-applied
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: {
        scope: true,
        sellerId: true,
        categoryId: true,
        targetProductIds: true,
      },
    });

    const criteria = {
      hasGlobal: false,
      sellerIds: [] as string[],
      categoryIds: [] as string[],
      productIds: [] as string[],
    };

    for (const d of activeDiscounts) {
      if (d.scope === DiscountScope.global && !d.sellerId) {
        criteria.hasGlobal = true;
      } else if (d.scope === DiscountScope.seller && d.sellerId) {
        criteria.sellerIds.push(d.sellerId);
      } else if (d.scope === DiscountScope.category && d.categoryId) {
        criteria.categoryIds.push(d.categoryId);
      } else if (
        d.scope === DiscountScope.product &&
        d.targetProductIds.length
      ) {
        criteria.productIds.push(...d.targetProductIds);
      }
    }

    return criteria;
  }

  /**
   * Get active public campaigns (for homepage/listing display)
   */
  async getActiveCampaigns(): Promise<ActiveCampaignDto[]> {
    const now = new Date();

    const campaigns = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null, // Only auto-applied campaigns
        startDate: { lte: now },
        endDate: { gte: now },
        scope: { in: [DiscountScope.global, DiscountScope.category] },
        sellerId: null, // Only admin-created campaigns
      },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { priority: "asc" },
    });

    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? undefined,
      type: c.type,
      value: Number(c.value),
      scope: c.scope,
      categoryId: c.categoryId || undefined,
      categoryName: c.category?.name,
      minCartValue: c.minCartValue ? Number(c.minCartValue) : undefined,
      endDate: c.endDate,
    }));
  }

  /**
   * Get discounts applicable to specific products
   */
  async getProductDiscounts(
    productIds: string[],
    sellerId?: string,
  ): Promise<Map<string, DiscountResponseDto[]>> {
    const now = new Date();

    // Get all active discounts that could apply to these products
    const discounts = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { scope: DiscountScope.global, sellerId: null },
          {
            scope: DiscountScope.product,
            targetProductIds: { hasSome: productIds },
          },
          ...(sellerId ? [{ scope: DiscountScope.seller, sellerId }] : []),
        ],
      },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { priority: "asc" },
    });

    const result = new Map<string, DiscountResponseDto[]>();

    for (const productId of productIds) {
      const applicableDiscounts = discounts.filter(
        (d) =>
          d.scope === DiscountScope.global ||
          (d.scope === DiscountScope.product &&
            d.targetProductIds.includes(productId)) ||
          (d.scope === DiscountScope.seller && d.sellerId === sellerId),
      );
      result.set(
        productId,
        applicableDiscounts.map((d) => this.mapToResponse(d)),
      );
    }

    return result;
  }

  // Helper methods

  private isProductEligibleForDiscount(
    product: { id: string; categoryId: string; sellerId: string },
    discount: {
      scope: DiscountScope;
      sellerId: string | null;
      categoryId: string | null;
      targetProductIds: string[];
    },
  ): boolean {
    switch (discount.scope) {
      case DiscountScope.global:
        return (
          discount.sellerId === null || discount.sellerId === product.sellerId
        );

      case DiscountScope.category:
        return product.categoryId === discount.categoryId;

      case DiscountScope.product:
        // Sadece seçili ürünler: boş liste = hiçbir ürüne uygulanmaz
        if (!discount.targetProductIds?.length) return false;
        return discount.targetProductIds.includes(product.id);

      case DiscountScope.seller:
        // Tüm mağaza: sadece bu satıcının ürünleri
        return (
          discount.sellerId != null && product.sellerId === discount.sellerId
        );

      default:
        return false;
    }
  }

  private mapToResponse(discount: any): DiscountResponseDto {
    const now = new Date();
    const isCurrentlyValid =
      discount.isActive &&
      now >= discount.startDate &&
      now <= discount.endDate &&
      (!discount.usageLimitTotal ||
        discount.usedCount < discount.usageLimitTotal);

    return {
      id: discount.id,
      code: discount.code,
      name: discount.name,
      description: discount.description,
      type: discount.type,
      value: Number(discount.value),
      scope: discount.scope,
      sellerId: discount.sellerId,
      sellerName: discount.seller?.displayName,
      categoryId: discount.categoryId,
      categoryName: discount.category?.name,
      targetProductIds: discount.targetProductIds,
      minCartValue: discount.minCartValue
        ? Number(discount.minCartValue)
        : undefined,
      maxDiscountAmount: discount.maxDiscountAmount
        ? Number(discount.maxDiscountAmount)
        : undefined,
      usageLimitTotal: discount.usageLimitTotal,
      usageLimitPerUser: discount.usageLimitPerUser,
      usedCount: discount.usedCount,

      isFlashSale: discount.isFlashSale,
      minQuantity: discount.minQuantity,
      buyQuantity: discount.buyQuantity,
      getQuantity: discount.getQuantity,

      isStackable: discount.isStackable,

      priority: discount.priority,
      isActive: discount.isActive,
      startDate: discount.startDate,
      endDate: discount.endDate,
      createdAt: discount.createdAt,
      updatedAt: discount.updatedAt,
      isCurrentlyValid,
      remainingUsage: discount.usageLimitTotal
        ? discount.usageLimitTotal - discount.usedCount
        : undefined,
    };
  }
}
