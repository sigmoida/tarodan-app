import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { SearchService } from "../search/search.service";
import { notifyWebRevalidate } from "../../common/revalidate";
import { fulltextDiscountSearch } from "../../common/helpers/fulltext-search";
import { resolveOrderBy } from "../../common/list";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { generateReferenceCode } from "../../common/helpers/generate-reference";
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
import {
  DiscountScope,
  DiscountType,
  DiscountFundedBy,
  DiscountTarget,
  DiscountAudience,
  CouponReservationStatus,
  Prisma,
} from "@prisma/client";
import {
  assertAudienceConsistent,
  assertBudgetForTarget,
  assertCodeAllowedForTarget,
  assertTargetAllowedForActor,
  audienceMatches,
} from "./discount-authorization";
import { isProductInDiscountScope } from "./discount-scope";
import { FeeDiscountResolver } from "./fee-discount.resolver";

/**
 * Kusursuz alıcıya iade edilen kupon, kampanya bittiyse koda özel bu kadar gün
 * daha yaşar (indirim-teknik §9).
 */
const COUPON_REISSUE_DAYS = 30;

/**
 * bogo / bulk_quantity are declared in the schema enum but have NO real redemption
 * logic (they fall through to the flat fixed-amount branch → mispricing). Reject them
 * at create/update until proper buy-X-get-Y / quantity-tier support exists (F4.2).
 */
function assertSupportedDiscountType(type?: DiscountType | null): void {
  if (type === DiscountType.bogo || type === DiscountType.bulk_quantity) {
    throw new BadRequestException(
      "Bu indirim tipi henüz desteklenmiyor (bogo/bulk_quantity)",
    );
  }
}

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly searchService: SearchService,
    @Optional()
    private readonly feeDiscountBudget?: FeeDiscountResolver,
  ) {}

  /**
   * İndirim değişince ürün listesi/detay cache'lerini temizle (fiyatlar kampanyaya göre hesaplanıyor)
   */
  private async invalidateProductCaches(
    productIds: string[] = [],
  ): Promise<void> {
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

    // Ürün-scope indirimlerde etkilenen ürünlerin ES dokümanını da senkronla
    // (best-effort). NOT: kampanya-etkili fiyat ES dokümanında tutulmuyor;
    // aramada kampanya fiyatının görünmesi ayrı bir iş (buildProductDocument).
    for (const pid of productIds) {
      this.searchService.syncProduct(pid).catch(() => {});
    }
    // Web ISR'yi anında tazele: ana sayfa rail'leri her indirim değişiminde,
    // ürün-scope'ta ilgili ürün sayfaları da (WEB_REVALIDATE_URL yoksa no-op).
    void notifyWebRevalidate([
      "products:list",
      ...productIds.map((pid) => `product:${pid}`),
    ]);
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
    // bogo / bulk_quantity are NOT implemented in the redemption engine — they would
    // be silently treated as a flat fixed-amount discount (mispricing, and compounds
    // the per-line bug). Block their creation until real buy-X-get-Y / quantity-tier
    // logic exists (F4.2).
    assertSupportedDiscountType(dto.type);

    // Cep kuralı: ürün fiyatı satıcının, bedeller platformun. Kupon kodu yalnız
    // alıcının ödediği kalemlere bağlanır; bedel indirimi TL bütçesi ister.
    const target = dto.target ?? DiscountTarget.product_price;
    const audience = dto.audience ?? DiscountAudience.everyone;
    assertTargetAllowedForActor(target, isAdmin);
    assertCodeAllowedForTarget(target, Boolean(dto.code));
    assertBudgetForTarget(target, dto.budgetLimit);
    assertAudienceConsistent({
      audience,
      target,
      tierTypes: dto.targetTierTypes,
      userIds: dto.targetUserIds,
    });

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
        // F2.4: yalnız admin platform/shared fonlama tanımlayabilir; satıcı kuponları
        // her zaman seller-funded (satıcı platform parasını yönlendiremez).
        fundedBy: isAdmin
          ? (dto.fundedBy ?? DiscountFundedBy.seller)
          : DiscountFundedBy.seller,
        platformFundedRatio:
          isAdmin &&
          dto.fundedBy === DiscountFundedBy.shared &&
          dto.platformFundedRatio != null
            ? new Prisma.Decimal(dto.platformFundedRatio)
            : null,
        target,
        audience,
        budgetLimit:
          dto.budgetLimit != null ? new Prisma.Decimal(dto.budgetLimit) : null,
        targetTiers: dto.targetTierTypes?.length
          ? {
              create: dto.targetTierTypes.map((tierType) => ({ tierType })),
            }
          : undefined,
        targetUsers: dto.targetUserIds?.length
          ? { create: dto.targetUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: {
        seller: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `Discount created: ${discount.id} by ${isAdmin ? "admin" : actorId}`,
    );

    await this.invalidateProductCaches(
      discount.scope === DiscountScope.product ? discount.targetProductIds : [],
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
      throw new NotFoundException("İndirim bulunamadı");
    }

    // bogo/bulk_quantity unsupported (F4.2) — reject switching to an unimplemented type.
    assertSupportedDiscountType(dto.type);

    // Sellers can only update their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException("Bu indirimi düzenleme yetkiniz yok");
    }

    // Cep kuralı düzenlemede de geçerlidir: hedef kalem değiştirilerek satıcı
    // platformun bedellerine, platform da satıcının fiyatına geçemez.
    const nextTarget = dto.target ?? discount.target;
    const nextAudience = dto.audience ?? discount.audience;
    assertTargetAllowedForActor(nextTarget, isAdmin);
    assertCodeAllowedForTarget(
      nextTarget,
      Boolean(dto.code !== undefined ? dto.code : discount.code),
    );
    assertBudgetForTarget(
      nextTarget,
      dto.budgetLimit !== undefined
        ? dto.budgetLimit
        : discount.budgetLimit != null
          ? Number(discount.budgetLimit)
          : null,
    );
    if (dto.target !== undefined || dto.audience !== undefined) {
      const [tiers, users] = await Promise.all([
        dto.targetTierTypes !== undefined
          ? Promise.resolve(dto.targetTierTypes as string[])
          : this.prisma.discountTargetTier
              .findMany({
                where: { discountId: id },
                select: { tierType: true },
              })
              .then((rows) => rows.map((row) => row.tierType as string)),
        dto.targetUserIds !== undefined
          ? Promise.resolve(dto.targetUserIds)
          : this.prisma.discountTargetUser
              .findMany({ where: { discountId: id }, select: { userId: true } })
              .then((rows) => rows.map((row) => row.userId)),
      ]);
      assertAudienceConsistent({
        audience: nextAudience,
        target: nextTarget,
        tierTypes: tiers,
        userIds: users,
      });
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
      // F2.4: yalnız admin fonlama modelini (kim üstlenir) değiştirebilir.
      ...(isAdmin &&
        dto.fundedBy !== undefined && {
          fundedBy: dto.fundedBy,
          platformFundedRatio:
            dto.fundedBy === DiscountFundedBy.shared &&
            dto.platformFundedRatio != null
              ? new Prisma.Decimal(dto.platformFundedRatio)
              : null,
        }),
      ...(dto.target !== undefined && { target: dto.target }),
      ...(dto.audience !== undefined && { audience: dto.audience }),
      ...(dto.budgetLimit !== undefined && {
        budgetLimit:
          dto.budgetLimit != null ? new Prisma.Decimal(dto.budgetLimit) : null,
        // Tavan yükseltilince durdurulmuş kampanya yeniden akmalıdır.
        budgetStoppedAt: null,
      }),
      // Hedef listeleri gönderildiyse TAMAMEN değiştirilir (kısmi ekleme yok:
      // "listeden çıkardım ama hâlâ indirim alıyor" durumunu doğururdu).
      ...(dto.targetTierTypes !== undefined && {
        targetTiers: {
          deleteMany: {},
          create: dto.targetTierTypes.map((tierType) => ({ tierType })),
        },
      }),
      ...(dto.targetUserIds !== undefined && {
        targetUsers: {
          deleteMany: {},
          create: dto.targetUserIds.map((userId) => ({ userId })),
        },
      }),
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

    await this.invalidateProductCaches(
      updated.scope === DiscountScope.product ? updated.targetProductIds : [],
    );
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
    await this.invalidateProductCaches(
      discount.scope === DiscountScope.product ? discount.targetProductIds : [],
    );
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
          ? await this.resolveUserTier(userId)
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
      const effectivePrices = await this.getEffectiveDisplayPriceMany(
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
          if (this.isProductEligibleForDiscount(product, discount)) {
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

  /**
   * Kullanıcının geçerli üyelik katmanı — üyelik hedefli kupon eşleşmesi için.
   * Aboneliği aktif değilse katman yok sayılır.
   */
  async resolveUserTier(userId: string): Promise<string | null> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      select: { status: true, tier: { select: { type: true } } },
    });
    if (!membership || membership.status !== "active") return null;
    return membership.tier?.type ?? null;
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
   * Reserve coupon capacity for a pending-payment order without consuming it.
   * `usedCount` and DiscountUsage are intentionally untouched here.
   */
  async reserveUsage(
    discountId: string,
    userId: string,
    orderId: string,
    amount: number,
    voucherCodeId: string | undefined,
    expiresAt: Date,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM discounts WHERE id = ${discountId} FOR UPDATE`;

      const existing = await tx.couponReservation.findUnique({
        where: { orderId },
      });
      if (existing) {
        if (
          existing.discountId === discountId &&
          existing.status === CouponReservationStatus.active
        ) {
          return;
        }
        throw new BadRequestException(
          "Sipariş için kupon rezervasyonu zaten var",
        );
      }

      const now = new Date();
      await tx.couponReservation.updateMany({
        where: {
          discountId,
          status: CouponReservationStatus.active,
          expiresAt: { lte: now },
        },
        data: {
          status: CouponReservationStatus.released,
          releasedAt: now,
        },
      });

      const discount = await tx.discount.findUnique({
        where: { id: discountId },
        select: {
          usedCount: true,
          usageLimitTotal: true,
          usageLimitPerUser: true,
        },
      });
      if (!discount) {
        throw new BadRequestException("Kupon bulunamadı");
      }

      const activeWhere = {
        discountId,
        status: CouponReservationStatus.active,
        expiresAt: { gt: now },
      };
      if (discount.usageLimitTotal) {
        const reserved = await tx.couponReservation.count({
          where: activeWhere,
        });
        if (discount.usedCount + reserved >= discount.usageLimitTotal) {
          throw new BadRequestException("Bu kupon kullanım limitine ulaştı");
        }
      }

      if (discount.usageLimitPerUser) {
        const [usedByUser, reservedByUser] = await Promise.all([
          tx.discountUsage.count({ where: { discountId, userId } }),
          tx.couponReservation.count({
            where: { ...activeWhere, userId },
          }),
        ]);
        if (usedByUser + reservedByUser >= discount.usageLimitPerUser) {
          throw new BadRequestException("Bu kuponu zaten kullandınız");
        }
      }

      if (voucherCodeId) {
        await tx.$queryRaw`SELECT id FROM discount_codes WHERE id = ${voucherCodeId} FOR UPDATE`;
        const voucher = await tx.discountCode.findUnique({
          where: { id: voucherCodeId },
          select: { isRedeemed: true },
        });
        const reservedVoucher = await tx.couponReservation.count({
          where: {
            voucherCodeId,
            status: CouponReservationStatus.active,
            expiresAt: { gt: now },
          },
        });
        if (!voucher || voucher.isRedeemed || reservedVoucher > 0) {
          throw new BadRequestException("Bu kupon kodu daha önce kullanıldı");
        }
      }

      await tx.couponReservation.create({
        data: {
          discountId,
          userId,
          orderId,
          amount: new Prisma.Decimal(amount),
          voucherCodeId: voucherCodeId ?? null,
          expiresAt,
        },
      });

      // Bütçe, rezerve edilen + tüketilen toplamıdır: ödeme ekranındaki sepet de
      // kampanyanın parasını tutar, aksi halde tavan aşılabilirdi.
      await this.feeDiscountBudget?.spendBudget([{ discountId, amount }], tx);
    };

    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  /**
   * Convert active reservations into real coupon usage after payment capture.
   * The status CAS makes duplicate callbacks idempotent.
   */
  async consumeReservedUsageForOrders(
    orderIds: string[],
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!orderIds.length) return;
    const run = async (tx: Prisma.TransactionClient) => {
      const reservations = await tx.couponReservation.findMany({
        where: {
          orderId: { in: orderIds },
          status: CouponReservationStatus.active,
        },
      });
      for (const reservation of reservations) {
        const consumed = await tx.couponReservation.updateMany({
          where: {
            id: reservation.id,
            status: CouponReservationStatus.active,
          },
          data: {
            status: CouponReservationStatus.consumed,
            consumedAt: new Date(),
          },
        });
        if (consumed.count === 0) continue;
        await this.recordUsage(
          reservation.discountId,
          reservation.userId,
          reservation.orderId,
          Number(reservation.amount),
          reservation.voucherCodeId ?? undefined,
          tx,
        );
      }
    };

    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  /**
   * Kusursuz alıcıya kuponu GERİ VERİR.
   *
   * Kullanım kaydı silinmez, iptal işareti alır (denetim izi kalır) ve kotadan
   * düşer. Kampanyanın toplam sayacı ile bütçesi geri açılır. Tek-kullanımlık kod
   * yeniden kullanılabilir hale gelir; kampanya bu arada sona ermişse koda ÖZEL
   * 30 günlük bir süre tanınır (kampanyanın tarihi herkes için değişmez).
   * Paylaşımlı kodlu kampanyada süre bittiyse kullanıcıya tek-kullanımlık yeni
   * bir kod üretilir.
   */
  async revokeUsageForOrders(
    orderIds: string[],
    reason: string,
    client?: Prisma.TransactionClient,
  ): Promise<{ revoked: number; reissuedCodes: string[] }> {
    if (!orderIds.length) return { revoked: 0, reissuedCodes: [] };

    const run = async (
      tx: Prisma.TransactionClient,
    ): Promise<{ revoked: number; reissuedCodes: string[] }> => {
      const usages = await tx.discountUsage.findMany({
        where: { orderId: { in: orderIds }, revokedAt: null },
        select: {
          id: true,
          discountId: true,
          userId: true,
          orderId: true,
          amount: true,
          discount: {
            select: { id: true, code: true, endDate: true, isActive: true },
          },
        },
      });
      if (!usages.length) return { revoked: 0, reissuedCodes: [] };

      const now = new Date();
      const reissuedCodes: string[] = [];

      for (const usage of usages) {
        const marked = await tx.discountUsage.updateMany({
          where: { id: usage.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: reason },
        });
        if (marked.count === 0) continue;

        // Toplam sayaç geri açılır (negatife düşmeden).
        await tx.$executeRaw`
          UPDATE discounts
          SET used_count = GREATEST(used_count - 1, 0), updated_at = NOW()
          WHERE id = ${usage.discountId}
        `;
        await this.feeDiscountBudget?.releaseBudget(
          [{ discountId: usage.discountId, amount: Number(usage.amount) }],
          tx,
        );

        const campaignOver =
          !usage.discount.isActive || now > usage.discount.endDate;
        const personalWindow = campaignOver
          ? new Date(now.getTime() + COUPON_REISSUE_DAYS * 24 * 60 * 60 * 1000)
          : null;

        // Bu siparişte harcanmış tek-kullanımlık kod varsa onu geri aç.
        const voucher = await tx.discountCode.findFirst({
          where: { discountId: usage.discountId, orderId: usage.orderId },
          select: { id: true, code: true },
        });
        if (voucher) {
          await tx.discountCode.update({
            where: { id: voucher.id },
            data: {
              isRedeemed: false,
              redeemedById: null,
              redeemedAt: null,
              orderId: null,
              ...(personalWindow ? { expiresAt: personalWindow } : {}),
            },
          });
          reissuedCodes.push(voucher.code);
          continue;
        }

        // Paylaşımlı kodlu kampanya bitmişse hak, kişiye özel yeni bir kodla
        // yaşatılır — aksi halde "geri verildi" dediğimiz hak kullanılamazdı.
        if (campaignOver && personalWindow) {
          const code = generateReferenceCode(REFERENCE_PREFIX.voucher);
          await tx.discountCode.create({
            data: {
              discountId: usage.discountId,
              code,
              expiresAt: personalWindow,
            },
          });
          reissuedCodes.push(code);
        }
      }

      return { revoked: usages.length, reissuedCodes };
    };

    return client ? run(client) : this.prisma.$transaction(run);
  }

  /** Release pending-payment reservations without changing real usage. */
  async releaseReservedUsageForOrders(
    orderIds: string[],
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!orderIds.length) return;
    const run = async (tx: Prisma.TransactionClient) => {
      // Serbest bırakılan rezervasyonun tuttuğu bütçe kampanyaya geri döner.
      const releasing = await tx.couponReservation.findMany({
        where: {
          orderId: { in: orderIds },
          status: CouponReservationStatus.active,
        },
        select: { discountId: true, amount: true },
      });
      const result = await tx.couponReservation.updateMany({
        where: {
          orderId: { in: orderIds },
          status: CouponReservationStatus.active,
        },
        data: {
          status: CouponReservationStatus.released,
          releasedAt: new Date(),
        },
      });
      await this.feeDiscountBudget?.releaseBudget(
        releasing.map((row) => ({
          discountId: row.discountId,
          amount: Number(row.amount),
        })),
        tx,
      );
      return result;
    };
    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  /**
   * Record discount usage after successful payment.
   *
   * INVARIANT (ödeme sonrası kupon geri kazanılmaz): coupon usage is intentionally
   * NON-REVERSIBLE. On order refund/cancellation we deliberately DO NOT
   * decrement `usedCount` nor delete the `DiscountUsage` row — the coupon stays
   * consumed. Do not add usage-restoration logic to any refund/cancel path.
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
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (tx: Prisma.TransactionClient) => {
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
      // Atomik toplam-limit koruması: usedCount artışı, limit dolmadıysa TEK
      // ifadede yapılır (column-to-column karşılaştırma Prisma where'de olmadığı
      // için raw SQL). validateCoupon ile recordUsage arasındaki yarışta iki
      // eşzamanlı sipariş limiti aşamaz — limit doluysa 0 satır etkilenir → throw.
      const updated = await tx.$executeRaw`
        UPDATE discounts
        SET used_count = used_count + 1, updated_at = NOW()
        WHERE id = ${discountId}
          AND (usage_limit_total IS NULL OR used_count < usage_limit_total)
      `;
      if (updated === 0) {
        throw new BadRequestException("Bu kupon kullanım limitine ulaştı");
      }
      // Per-user limit (F4.5): the UPDATE above locked the discount row, so this
      // count-then-insert is serialized across concurrent redemptions of the SAME
      // coupon → no TOCTOU race. This is the authoritative enforcement (validateCoupon
      // only pre-checks for UX). Guests never reach here for per-user coupons — they
      // are rejected up front in validateCoupon (shared identity is unenforceable).
      const perUser = await tx.discount.findUnique({
        where: { id: discountId },
        select: { usageLimitPerUser: true },
      });
      if (perUser?.usageLimitPerUser) {
        const userUsage = await tx.discountUsage.count({
          where: { discountId, userId, revokedAt: null },
        });
        if (userUsage >= perUser.usageLimitPerUser) {
          throw new BadRequestException("Bu kuponu zaten kullandınız");
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
    };
    // Join the caller's transaction so usage is ATOMIC with order creation (F4.4):
    // if the order tx rolls back, the usedCount increment / voucher redeem / usage
    // row roll back too — no phantom-consumed coupon on a rolled-back checkout.
    // Standalone callers (no tx) still get their own transaction.
    if (client) {
      await run(client);
    } else {
      await this.prisma.$transaction(run);
    }

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

  /**
   * Hediye/kupon kodu. Parasal değer taşıdığı için kriptografik rastgelelik
   * şart: tahmin edilebilir bir kod doğrudan para kaybıdır. Çakışma ayrıca
   * `code` üzerindeki unique index ile yakalanır.
   */
  private randomVoucherCode(prefix: string): string {
    return generateReferenceCode(prefix || REFERENCE_PREFIX.voucher);
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

  /**
   * Kapsam kuralı tek kaynaktan (`discount-scope.ts`) okunur: kupon doğrulaması,
   * vitrin fiyatı ve bedel kampanyası çözümü aynı yanıtı verir.
   */
  private isProductEligibleForDiscount(
    product: { id: string; categoryId: string; sellerId: string },
    discount: {
      scope: DiscountScope;
      sellerId: string | null;
      categoryId: string | null;
      targetProductIds: string[];
    },
  ): boolean {
    return isProductInDiscountScope(product, discount);
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
      target: discount.target,
      audience: discount.audience,
      targetTierTypes: discount.targetTiers?.map((row: any) => row.tierType),
      targetUserIds: discount.targetUsers?.map((row: any) => row.userId),
      budgetLimit:
        discount.budgetLimit != null ? Number(discount.budgetLimit) : undefined,
      budgetSpent: Number(discount.budgetSpent ?? 0),
      budgetStoppedAt: discount.budgetStoppedAt ?? undefined,
    };
  }
}
