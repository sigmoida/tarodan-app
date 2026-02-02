import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
  ValidateCouponDto,
  DiscountResponseDto,
  PaginatedDiscountsDto,
  ValidationResultDto,
  ActiveCampaignDto,
} from './dto';
import { DiscountScope, Prisma } from '@prisma/client';

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      throw new ForbiddenException('Satıcılar global indirim oluşturamazlar');
    }

    if (!isAdmin && dto.scope === DiscountScope.category) {
      throw new ForbiddenException('Satıcılar kategori indirimi oluşturamazlar');
    }

    // Validate category exists if scope is category
    if (dto.scope === DiscountScope.category && dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Kategori bulunamadı');
      }
    }

    // Validate products exist and belong to seller if scope is product
    if (dto.scope === DiscountScope.product && dto.targetProductIds?.length) {
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: dto.targetProductIds },
          ...(actorId && !isAdmin ? { sellerId: actorId } : {}),
        },
      });

      if (products.length !== dto.targetProductIds.length) {
        throw new BadRequestException(
          isAdmin
            ? 'Bazı ürünler bulunamadı'
            : 'Sadece kendi ürünleriniz için indirim oluşturabilirsiniz',
        );
      }
    }

    // Check for duplicate coupon code
    if (dto.code) {
      const existing = await this.prisma.discount.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new BadRequestException('Bu kupon kodu zaten kullanılıyor');
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
      `Discount created: ${discount.id} by ${isAdmin ? 'admin' : actorId}`,
    );

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
      throw new NotFoundException('İndirim bulunamadı');
    }

    // Sellers can only update their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException('Bu indirimi düzenleme yetkiniz yok');
    }

    // Check code uniqueness if changing
    if (dto.code && dto.code !== discount.code) {
      const existing = await this.prisma.discount.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new BadRequestException('Bu kupon kodu zaten kullanılıyor');
      }
    }

    const updated = await this.prisma.discount.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code?.toUpperCase() || null }),
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type && { type: dto.type }),
        ...(dto.value !== undefined && {
          value: new Prisma.Decimal(dto.value),
        }),
        ...(dto.scope && { scope: dto.scope }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.targetProductIds && { targetProductIds: dto.targetProductIds }),
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
        ...(dto.isStackable !== undefined && { isStackable: dto.isStackable }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    this.logger.log(`Discount updated: ${id}`);

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
      throw new NotFoundException('İndirim bulunamadı');
    }

    // Sellers can only delete their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException('Bu indirimi silme yetkiniz yok');
    }

    await this.prisma.discount.delete({ where: { id } });
    this.logger.log(`Discount deleted: ${id}`);
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
      throw new NotFoundException('İndirim bulunamadı');
    }

    // Sellers can only view their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException('Bu indirimi görüntüleme yetkiniz yok');
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
      sortBy = 'created_desc',
    } = query;

    const where: Prisma.DiscountWhereInput = {
      // Sellers only see their own discounts
      ...(isAdmin
        ? sellerId
          ? { sellerId }
          : {}
        : { sellerId: actorId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search.toUpperCase(), mode: 'insensitive' as const } },
        ],
      }),
      ...(scope && { scope }),
      ...(isActive !== undefined && { isActive }),
      ...(couponsOnly && { code: { not: null } }),
      ...(autoOnly && { code: null }),
    };

    const orderBy = this.getOrderBy(sortBy);

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
    const discount = await this.prisma.discount.findUnique({
      where: { code: dto.code.toUpperCase() },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    if (!discount) {
      return { isValid: false, error: 'Kupon kodu bulunamadı' };
    }

    if (!discount.isActive) {
      return { isValid: false, error: 'Bu kupon artık aktif değil' };
    }

    const now = new Date();
    if (now < discount.startDate) {
      return { isValid: false, error: 'Bu kupon henüz başlamadı' };
    }

    if (now > discount.endDate) {
      return { isValid: false, error: 'Bu kuponun süresi doldu' };
    }

    // Check total usage limit
    if (
      discount.usageLimitTotal &&
      discount.usedCount >= discount.usageLimitTotal
    ) {
      return { isValid: false, error: 'Bu kupon kullanım limitine ulaştı' };
    }

    // Check per-user usage limit
    if (discount.usageLimitPerUser) {
      const userUsageCount = await this.prisma.discountUsage.count({
        where: { discountId: discount.id, userId },
      });
      if (userUsageCount >= discount.usageLimitPerUser) {
        return {
          isValid: false,
          error: 'Bu kuponu zaten kullandınız',
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
            if (discount.type === 'percentage') {
              estimatedDiscount += itemPrice * (Number(discount.value) / 100);
            } else {
              estimatedDiscount += Number(discount.value);
            }
          }
        }
      }
    }

    // Check minimum cart value
    if (
      discount.minCartValue &&
      cartTotal < Number(discount.minCartValue)
    ) {
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
        code: discount.code!,
        type: discount.type,
        value: Number(discount.value),
        scope: discount.scope,
        estimatedDiscount,
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
   * Record discount usage after order completion
   */
  async recordUsage(
    discountId: string,
    userId: string,
    orderId: string,
    amount: number,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.discountUsage.create({
        data: {
          discountId,
          userId,
          orderId,
          amount: new Prisma.Decimal(amount),
        },
      }),
      this.prisma.discount.update({
        where: { id: discountId },
        data: { usedCount: { increment: 1 } },
      }),
    ]);

    this.logger.log(
      `Discount usage recorded: ${discountId} by ${userId} for order ${orderId}`,
    );
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
    const now = new Date();
    const discounts = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null,
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { scope: DiscountScope.global, sellerId: null },
          { scope: DiscountScope.seller, sellerId },
          { scope: DiscountScope.category, categoryId },
          {
            scope: DiscountScope.product,
            targetProductIds: { has: productId },
          },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    let bestPrice: number | null = null;
    for (const d of discounts) {
      const product = {
        id: productId,
        sellerId,
        categoryId,
      };
      if (!this.isProductEligibleForDiscount(product, d)) continue;

      let effectivePrice: number;
      if (d.type === 'percentage') {
        const discountAmount =
          currentDisplayPrice * (Number(d.value) / 100);
        const capped =
          d.maxDiscountAmount != null
            ? Math.min(discountAmount, Number(d.maxDiscountAmount))
            : discountAmount;
        effectivePrice = Math.max(0, currentDisplayPrice - capped);
      } else {
        effectivePrice = Math.max(
          0,
          currentDisplayPrice - Math.min(Number(d.value), currentDisplayPrice),
        );
      }
      if (effectivePrice < currentDisplayPrice) {
        if (bestPrice == null || effectivePrice < bestPrice) {
          bestPrice = effectivePrice;
        }
      }
    }
    return bestPrice;
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
      orderBy: { priority: 'asc' },
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
          { scope: DiscountScope.product, targetProductIds: { hasSome: productIds } },
          ...(sellerId ? [{ scope: DiscountScope.seller, sellerId }] : []),
        ],
      },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'asc' },
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
      result.set(productId, applicableDiscounts.map((d) => this.mapToResponse(d)));
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
        // If admin discount, applies to all
        // If seller discount, only seller's products
        return discount.sellerId === null || discount.sellerId === product.sellerId;

      case DiscountScope.category:
        return product.categoryId === discount.categoryId;

      case DiscountScope.product:
        return discount.targetProductIds.includes(product.id);

      case DiscountScope.seller:
        return product.sellerId === discount.sellerId;

      default:
        return false;
    }
  }

  private getOrderBy(
    sortBy: string,
  ): Prisma.DiscountOrderByWithRelationInput {
    switch (sortBy) {
      case 'created_asc':
        return { createdAt: 'asc' };
      case 'name_asc':
        return { name: 'asc' };
      case 'name_desc':
        return { name: 'desc' };
      case 'priority_asc':
        return { priority: 'asc' };
      case 'created_desc':
      default:
        return { createdAt: 'desc' };
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
