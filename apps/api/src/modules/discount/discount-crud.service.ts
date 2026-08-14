import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { SearchService } from "../search/search.service";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";
import { fulltextDiscountSearch } from "../../common/helpers/fulltext-search";
import { resolveOrderBy } from "../../common/list";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { generateReferenceCode } from "../../common/helpers/generate-reference";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
  DiscountResponseDto,
  PaginatedDiscountsDto,
} from "./dto";
import {
  DiscountScope,
  DiscountType,
  DiscountFundedBy,
  DiscountTarget,
  DiscountAudience,
  Prisma,
} from "@prisma/client";
import {
  assertAudienceConsistent,
  assertBudgetForTarget,
  assertCodeAllowedForTarget,
  assertSellerCampaignHasCode,
  assertTargetAllowedForActor,
} from "./helpers/discount-authorization";
import { toDiscountResponse } from "./helpers/discount-response.mapper";
import { i18nMessage } from "../i18n";

/**
 * Adet koşullu türlerin (bogo / bulk_quantity) şekil doğrulaması. İkisi de
 * SATICI ürün-fiyatı kampanyasıdır (cep kuralı: assertTargetAllowedForActor
 * admin'i zaten engeller), kodsuz-otomatik çalışır ve sepette SATIR bazında
 * uygulanır (quantity-campaign.ts).
 */
function assertQuantityTypeShape(input: {
  type?: DiscountType | null;
  target: DiscountTarget;
  value?: number | null;
  minQuantity?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
}): void {
  const { type } = input;
  if (type !== DiscountType.bogo && type !== DiscountType.bulk_quantity) {
    return;
  }
  if (input.target !== DiscountTarget.product_price) {
    throw new BadRequestException(
      i18nMessage("server.discount.quantityCampaignProductOnly"),
    );
  }
  if (type === DiscountType.bogo) {
    if (
      !(Number(input.buyQuantity) >= 1) ||
      !(Number(input.getQuantity) >= 1)
    ) {
      throw new BadRequestException(
        i18nMessage("server.discount.buyXGetYMinimum"),
      );
    }
    return;
  }
  // bulk_quantity: eşik en az 2 (tek adet koşulsuz indirim demektir — o iş
  // ilan fiyatının), değer 0-100 arası yüzde.
  if (!(Number(input.minQuantity) >= 2)) {
    throw new BadRequestException(
      i18nMessage("server.discount.minQuantityAtLeastTwo"),
    );
  }
  const percent = Number(input.value);
  if (!(percent > 0) || percent > 100) {
    throw new BadRequestException(
      i18nMessage("server.discount.quantityPercentRange"),
    );
  }
}

/**
 * İndirim/kupon kayıtlarının yönetimi: oluşturma, güncelleme, silme, listeleme
 * ve kişisel voucher kodu üretimi. DiscountService'ten birebir taşındı.
 *
 * Yazma yollarının hepsi aynı üç adımı paylaşıyor — yetki/şekil doğrulaması,
 * kaydın yazılması, ardından ürün cache'i + ES + web ISR tazelemesi
 * (`invalidateProductCaches`). Bu üçlü tek serviste durmazsa bir yazma yolu
 * tazelemeyi unuttuğunda vitrin eski fiyatı göstermeye devam eder.
 */
@Injectable()
export class DiscountCrudService {
  private readonly logger = new Logger(DiscountCrudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly searchService: SearchService,
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
    // Cep kuralı: ürün fiyatı satıcının, bedeller platformun. Kupon kodu yalnız
    // alıcının ödediği kalemlere bağlanır; bedel indirimi TL bütçesi ister.
    const target = dto.target ?? DiscountTarget.product_price;
    const audience = dto.audience ?? DiscountAudience.everyone;
    assertQuantityTypeShape({
      type: dto.type,
      target,
      value: dto.value,
      minQuantity: dto.minQuantity,
      buyQuantity: dto.buyQuantity,
      getQuantity: dto.getQuantity,
    });
    assertTargetAllowedForActor(target, isAdmin);
    assertCodeAllowedForTarget(target, Boolean(dto.code));
    assertSellerCampaignHasCode(target, isAdmin, Boolean(dto.code), dto.type);
    assertBudgetForTarget(target, dto.budgetLimit);
    assertAudienceConsistent({
      audience,
      target,
      tierTypes: dto.targetTierTypes,
      userIds: dto.targetUserIds,
    });

    // Limitsiz (kişi-başı limitsiz) kod yalnız kitlesi HERKES olan kampanyada
    // tanımlanabilir: misafirler ancak böyle bir kodu kullanabilir, kimlik
    // gerektiren kitlede ise limitsizlik kişi-başı denetimi anlamsız kılar.
    if (dto.usageLimitPerUser === 0 && audience !== DiscountAudience.everyone) {
      throw new BadRequestException(
        i18nMessage("server.discount.unlimitedPerUserEveryoneOnly"),
      );
    }

    // Sellers can only create discounts for their own products
    if (!isAdmin && dto.scope === DiscountScope.global) {
      throw new ForbiddenException(
        i18nMessage("server.discount.sellerNoGlobal"),
      );
    }

    if (!isAdmin && dto.scope === DiscountScope.category) {
      throw new ForbiddenException(
        i18nMessage("server.discount.sellerNoCategory"),
      );
    }

    // Validate category exists if scope is category
    if (dto.scope === DiscountScope.category && dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          i18nMessage("server.product.categoryNotFound"),
        );
      }
    }

    // Scope=product: hedef ürün listesi zorunlu (seçili ürünler)
    if (dto.scope === DiscountScope.product) {
      if (!dto.targetProductIds?.length) {
        throw new BadRequestException(
          i18nMessage("server.discount.selectedProductsRequired"),
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
        throw new BadRequestException(i18nMessage("server.discount.codeInUse"));
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
        // 0 = bilinçli limitsiz (null): misafirlerin kullanabildiği tek kod türü.
        // Varsayılan 1 — limitsizlik ancak açıkça istenirse.
        usageLimitPerUser:
          dto.usageLimitPerUser === 0 ? null : dto.usageLimitPerUser || 1,
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
    return toDiscountResponse(discount);
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
      throw new NotFoundException(i18nMessage("server.discount.notFound"));
    }

    // Sellers can only update their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException(
        i18nMessage("server.discount.editForbidden"),
      );
    }

    // Cep kuralı düzenlemede de geçerlidir: hedef kalem değiştirilerek satıcı
    // platformun bedellerine, platform da satıcının fiyatına geçemez.
    const nextTarget = dto.target ?? discount.target;
    const nextAudience = dto.audience ?? discount.audience;
    // Adet koşullu tür kuralları birleşik (dto ?? mevcut) değerlerle doğrulanır.
    assertQuantityTypeShape({
      type: dto.type ?? discount.type,
      target: nextTarget,
      value: dto.value ?? Number(discount.value),
      minQuantity:
        dto.minQuantity !== undefined ? dto.minQuantity : discount.minQuantity,
      buyQuantity:
        dto.buyQuantity !== undefined ? dto.buyQuantity : discount.buyQuantity,
      getQuantity:
        dto.getQuantity !== undefined ? dto.getQuantity : discount.getQuantity,
    });
    assertTargetAllowedForActor(nextTarget, isAdmin);
    assertCodeAllowedForTarget(
      nextTarget,
      Boolean(dto.code !== undefined ? dto.code : discount.code),
    );
    assertSellerCampaignHasCode(
      nextTarget,
      isAdmin,
      Boolean(dto.code !== undefined ? dto.code : discount.code),
      dto.type ?? discount.type,
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

    // Limitsiz kod kuralı düzenlemede de geçerli (create ile aynı gerekçe).
    const nextPerUserLimit =
      dto.usageLimitPerUser !== undefined
        ? dto.usageLimitPerUser
        : discount.usageLimitPerUser;
    if (
      (nextPerUserLimit === 0 || nextPerUserLimit === null) &&
      nextAudience !== DiscountAudience.everyone
    ) {
      throw new BadRequestException(
        i18nMessage("server.discount.unlimitedPerUserEveryoneOnly"),
      );
    }

    // Check code uniqueness if changing
    if (dto.code && dto.code !== discount.code) {
      const existing = await this.prisma.discount.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new BadRequestException(i18nMessage("server.discount.codeInUse"));
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
          i18nMessage("server.discount.selectedProductsRequired"),
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
        // 0 = bilinçli limitsiz (null) — yalnız 'herkes' kitlesinde (yukarıda
        // doğrulandı); misafirlerin kullanabildiği tek kod türü.
        usageLimitPerUser:
          dto.usageLimitPerUser === 0 ? null : dto.usageLimitPerUser,
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
    return toDiscountResponse(updated);
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
      throw new NotFoundException(i18nMessage("server.discount.notFound"));
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
      throw new NotFoundException(i18nMessage("server.discount.notFound"));
    }

    // Sellers can only view their own discounts
    if (!isAdmin && discount.sellerId !== actorId) {
      throw new ForbiddenException(
        i18nMessage("server.discount.viewForbidden"),
      );
    }

    return toDiscountResponse(discount);
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

    return discount ? toDiscountResponse(discount) : null;
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
      items: items.map((d) => toDiscountResponse(d)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
    if (!discount)
      throw new NotFoundException(i18nMessage("server.discount.notFound"));
    if (count < 1 || count > 10000) {
      throw new BadRequestException(
        i18nMessage("server.discount.codeCountRange"),
      );
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
}
