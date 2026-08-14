import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import { CacheService } from "../../cache/cache.service";
import { AdminAuditService } from "../ops/admin-audit.service";
import { generateSlug } from "./admin-slug.util";
import {
  fulltextAttributeGroupSearch,
  fulltextAttributeSearch,
} from "../../../common/helpers/fulltext-search";
import { Brand, Prisma, ProductKind } from "@prisma/client";
import { dateRangeWhere, paginate, resolveOrderBy } from "../../../common/list";
import {
  AdminAttributeGroupQueryDto,
  AdminAttributeQueryDto,
  AdminBrandQueryDto,
  AdminCarModelQueryDto,
  AdminCategoryQueryDto,
  AdminManufacturerQueryDto,
} from "../dto";
import {
  assertCategoryHasPublishedCommissionCoverage,
  assertNoActiveCategoryDescendants,
  assertValidCategoryParent,
  CATEGORIES_CACHE_KEY,
} from "../../category/category-integrity.helper";
import { i18nMessage } from "../../i18n";
import { SCALE_GROUP_SLUG } from "../../../common/helpers/attribute-groups";

/**
 * Katalog taksonomisi admin operasyonları (kategori, marka, üretici, araç
 * modeli, özellik grubu/değeri) — AdminService'in CATEGORY / BRAND /
 * MANUFACTURER / CAR MODEL / ATTRIBUTE GROUP / ATTRIBUTE VALUE
 * bölümlerinden birebir taşındı. AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminCatalogService {
  private readonly logger = new Logger(AdminCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  private async invalidateCategoriesCache(): Promise<void> {
    await this.cache.del(CATEGORIES_CACHE_KEY);
  }

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== CATEGORY MANAGEMENT ====================

  /**
   * Get categories with tree structure
   */
  async getCategories(
    query: AdminCategoryQueryDto = new AdminCategoryQueryDto(),
  ) {
    const { search } = query;
    const where: Prisma.CategoryWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    Object.assign(where, dateRangeWhere(query));

    const orderBy = resolveOrderBy<Prisma.CategoryOrderByWithRelationInput>(
      "Category",
      query,
      {
        defaultSort: { name: "asc" },
        sortMap: {
          productCount: (direction) => ({
            products: { _count: direction },
          }),
          collectionCount: (direction) => ({
            collections: { _count: direction },
          }),
        },
      },
    );
    const result = await paginate(
      this.prisma.category,
      {
        where,
        include: {
          parent: true,
          children: { orderBy: { name: "asc" } },
          _count: {
            select: {
              products: { where: { kind: ProductKind.listing } },
              collections: true,
            },
          },
        },
        orderBy,
      },
      query,
    );

    // Per-category product counts split by status (active / inactive / pending),
    // aggregated in one groupBy for the page's categories. Prisma's `_count` is
    // unfiltered, so status splits need this separate query.
    const catIds = result.data.map((c) => c.id);
    const statusCounts = catIds.length
      ? await this.prisma.product.groupBy({
          by: ["categoryId", "status"],
          where: {
            kind: ProductKind.listing,
            categoryId: { in: catIds },
            status: { in: ["active", "inactive", "pending"] as any },
          },
          _count: { _all: true },
        })
      : [];
    const countFor = (catId: string, status: string) =>
      statusCounts.find((g) => g.categoryId === catId && g.status === status)
        ?._count._all ?? 0;

    const data = result.data.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      parentId: c.parentId,
      parent: c.parent ? { id: c.parent.id, name: c.parent.name } : null,
      children: c.children.map((child) => ({
        id: child.id,
        name: child.name,
        slug: child.slug,
      })),
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: c._count.products,
      activeProducts: countFor(c.id, "active"),
      passiveProducts: countFor(c.id, "inactive"),
      pendingProducts: countFor(c.id, "pending"),
      collectionCount: c._count.collections,
      createdAt: c.createdAt,
    }));

    return { ...result, data };
  }

  /**
   * Create category
   */
  async createCategory(
    adminId: string,
    dto: {
      name: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    if (dto.isActive === true) {
      throw new BadRequestException(
        i18nMessage("server.category.createInactiveFirst"),
      );
    }
    // Check if parent exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException(
          i18nMessage("server.category.parentNotFound"),
        );
      }
    }

    // Generate slug
    let slug = generateSlug(dto.name);
    let slugExists = await this.prisma.category.findUnique({
      where: { slug },
    });

    // If slug exists, append number
    let counter = 1;
    while (slugExists) {
      slug = `${generateSlug(dto.name)}-${counter}`;
      slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });
      counter++;
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description || null,
        parentId: dto.parentId || null, // Empty string becomes null (root category)
        sortOrder: dto.sortOrder || 0,
        // Yeni kategori önce komisyon taslağına eklenip yayınlanmalıdır. ID ancak
        // create sonrası oluştuğu için doğrudan aktif yaratmak kapsama invariantını
        // bozar; aktivasyon update yolundaki guard'dan geçer.
        isActive: false,
      },
    });

    await this.invalidateCategoriesCache();

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "category_create",
      "Category",
      category.id,
      null,
      category,
    );

    return category;
  }

  /**
   * Update category
   */
  async updateCategory(
    adminId: string,
    categoryId: string,
    dto: {
      name?: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException(
        i18nMessage("server.product.categoryNotFound"),
      );
    }

    const nextParentId =
      dto.parentId !== undefined ? dto.parentId || null : category.parentId;
    const nextIsActive = dto.isActive ?? category.isActive;

    if (nextParentId && (dto.parentId !== undefined || dto.isActive === true)) {
      await assertValidCategoryParent(
        this.prisma,
        categoryId,
        nextParentId,
        nextIsActive,
      );
    }

    if (dto.isActive === false && category.isActive) {
      await assertNoActiveCategoryDescendants(this.prisma, categoryId);
    }

    if (dto.isActive === true && !category.isActive) {
      await assertCategoryHasPublishedCommissionCoverage(
        this.prisma,
        categoryId,
      );
    }

    // Generate new slug if name changed
    let slug = category.slug;
    if (dto.name && dto.name !== category.name) {
      slug = generateSlug(dto.name);
      const slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });

      if (slugExists && slugExists.id !== categoryId) {
        // Slug exists for another category, append number
        let counter = 1;
        while (slugExists) {
          slug = `${generateSlug(dto.name)}-${counter}`;
          const check = await this.prisma.category.findUnique({
            where: { slug },
          });
          if (!check || check.id === categoryId) break;
          counter++;
        }
      }
    }

    const oldCategory = { ...category };
    const updatedCategory = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        slug,
        description:
          dto.description !== undefined ? dto.description || null : undefined,
        parentId: dto.parentId !== undefined ? dto.parentId || null : undefined, // Empty string becomes null
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    await this.invalidateCategoriesCache();

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "category_update",
      "Category",
      categoryId,
      oldCategory,
      updatedCategory,
    );

    return updatedCategory;
  }

  /**
   * Delete category
   */
  async deleteCategory(adminId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(
        i18nMessage("server.product.categoryNotFound"),
      );
    }

    // Check if category has products
    if (category._count.products > 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.catalog.categoryHasProducts"),
      );
    }

    // Check if category has children
    if (category.children.length > 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.catalog.categoryHasChildren"),
      );
    }

    await this.prisma.category.delete({
      where: { id: categoryId },
    });

    await this.invalidateCategoriesCache();

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "category_delete",
      "Category",
      categoryId,
      category,
      null,
    );

    return { success: true, categoryId };
  }

  // ==================== BRAND MANAGEMENT ====================

  /**
   * Get all brands
   */
  async getBrands(query: AdminBrandQueryDto = new AdminBrandQueryDto()) {
    const { search, status } = query;
    const where: Prisma.BrandWhereInput = {};
    if (status === "active") where.isActive = true;
    else if (status === "inactive") where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy = resolveOrderBy<Prisma.BrandOrderByWithRelationInput>(
      "Brand",
      query,
      { defaultSort: { name: "asc" } },
    );
    const result = await paginate(this.prisma.brand, { where, orderBy }, query);

    const data = result.data.map((b: Brand) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      // Faz 1: logo S3 key taşır — URL tek yerden kurulur.
      logo: this.resolveProductImageUrl(b.logo),
      description: b.description,
      website: b.website,
      country: b.country,
      foundedYear: b.foundedYear,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));

    return { ...result, data };
  }

  /**
   * Create a new brand
   */
  async createBrand(
    adminId: string,
    dto: {
      name: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    // Generate slug from name
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    // Check if brand with same name or slug exists
    const existing = await this.prisma.brand.findFirst({
      where: {
        OR: [{ name: { equals: dto.name, mode: "insensitive" } }, { slug }],
      },
    });

    if (existing) {
      throw new BadRequestException("Bu isimde bir marka zaten mevcut");
    }

    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name,
        slug,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "brand_create",
      "Brand",
      brand.id,
      null,
      brand,
    );

    this.logger.log(
      `Brand created: ${brand.name} (${brand.id}) by admin ${adminId}`,
    );

    return brand;
  }

  /**
   * Update brand
   */
  async updateBrand(
    adminId: string,
    brandId: string,
    dto: {
      name?: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!existing) {
      throw new NotFoundException(i18nMessage("server.brand.notFound"));
    }

    // If name is being changed, check for duplicates and update slug
    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

      const duplicate = await this.prisma.brand.findFirst({
        where: {
          OR: [{ name: { equals: dto.name, mode: "insensitive" } }, { slug }],
          NOT: { id: brandId },
        },
      });

      if (duplicate) {
        throw new BadRequestException("Bu isimde bir marka zaten mevcut");
      }
    }

    const updated = await this.prisma.brand.update({
      where: { id: brandId },
      data: {
        name: dto.name,
        slug: dto.name ? slug : undefined,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "brand_update",
      "Brand",
      brandId,
      existing,
      updated,
    );

    this.logger.log(
      `Brand updated: ${updated.name} (${updated.id}) by admin ${adminId}`,
    );

    return updated;
  }

  /**
   * Delete brand
   */
  async deleteBrand(adminId: string, brandId: string) {
    const existing = await this.prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        _count: { select: { products: true, carModels: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException(i18nMessage("server.brand.notFound"));
    }

    const { products: productCount, carModels: carModelCount } = (
      existing as any
    )._count;
    if (productCount > 0 || carModelCount > 0) {
      throw new ConflictException(
        i18nMessage("server.admin.catalog.brandInUse", {
          products: productCount,
          models: carModelCount,
        }),
      );
    }

    await this.prisma.brand.delete({
      where: { id: brandId },
    });

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "brand_delete",
      "Brand",
      brandId,
      existing,
      null,
    );

    this.logger.log(
      `Brand deleted: ${existing.name} (${existing.id}) by admin ${adminId}`,
    );

    return { success: true };
  }

  // ==================== MANUFACTURER MANAGEMENT ====================

  async getManufacturers(
    query: AdminManufacturerQueryDto = new AdminManufacturerQueryDto(),
  ) {
    const { search } = query;
    const where: Prisma.ManufacturerWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { country: { contains: search, mode: "insensitive" } },
        { website: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy = resolveOrderBy<Prisma.ManufacturerOrderByWithRelationInput>(
      "Manufacturer",
      query,
      { defaultSort: { name: "asc" } },
    );
    const result = await paginate(
      this.prisma.manufacturer,
      { where, orderBy },
      query,
    );

    const data = result.data.map((m) => ({
      ...m,
      logo: this.resolveProductImageUrl(m.logo),
    }));

    return { ...result, data };
  }

  async createManufacturer(
    adminId: string,
    dto: {
      name: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    const existing = await this.prisma.manufacturer.findFirst({
      where: {
        OR: [{ name: { equals: dto.name, mode: "insensitive" } }, { slug }],
      },
    });
    if (existing)
      throw new BadRequestException(
        i18nMessage("server.admin.catalog.manufacturerExists"),
      );

    const manufacturer = await this.prisma.manufacturer.create({
      data: {
        name: dto.name,
        slug,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "manufacturer_create",
      "Manufacturer",
      manufacturer.id,
      null,
      manufacturer,
    );
    return manufacturer;
  }

  async updateManufacturer(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      foundedYear?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.manufacturer.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.manufacturer.notFound"));

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      const duplicate = await this.prisma.manufacturer.findFirst({
        where: {
          OR: [{ name: { equals: dto.name, mode: "insensitive" } }, { slug }],
          NOT: { id },
        },
      });
      if (duplicate)
        throw new BadRequestException(
          i18nMessage("server.admin.catalog.manufacturerExists"),
        );
    }

    const updated = await this.prisma.manufacturer.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slug : undefined,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        foundedYear: dto.foundedYear,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "manufacturer_update",
      "Manufacturer",
      id,
      existing,
      updated,
    );
    return updated;
  }

  async deleteManufacturer(adminId: string, id: string) {
    const existing = await this.prisma.manufacturer.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.manufacturer.notFound"));
    await this.prisma.manufacturer.delete({ where: { id } });
    await this.audit.createAuditLog(
      adminId,
      "manufacturer_delete",
      "Manufacturer",
      id,
      existing,
      null,
    );
    return { success: true };
  }

  // ==================== CAR MODEL MANAGEMENT ====================

  async getCarModels(
    query: AdminCarModelQueryDto = new AdminCarModelQueryDto(),
  ) {
    const { brandId, search } = query;
    const where: Prisma.CarModelWhereInput = {};
    if (brandId) where.brandId = brandId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { brand: { name: { contains: search, mode: "insensitive" } } },
      ];
    }
    const orderBy = resolveOrderBy<
      | Prisma.CarModelOrderByWithRelationInput
      | Prisma.CarModelOrderByWithRelationInput[]
    >("CarModel", query, {
      defaultSort: [{ brand: { name: "asc" } }, { name: "asc" }],
      sortMap: {
        "brand.name": (direction) => ({ brand: { name: direction } }),
      },
    });
    const include = { brand: { select: { id: true, name: true, slug: true } } };

    return paginate(this.prisma.carModel, { where, orderBy, include }, query);
  }

  async createCarModel(
    adminId: string,
    dto: {
      brandId: string;
      name: string;
      slug?: string;
      yearStart?: number;
      yearEnd?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const brand = await this.prisma.brand.findUnique({
      where: { id: dto.brandId },
    });
    if (!brand)
      throw new NotFoundException(i18nMessage("server.brand.notFound"));

    const slug =
      dto.slug ||
      `${brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

    const existing = await this.prisma.carModel.findFirst({
      where: {
        OR: [
          { slug },
          {
            brandId: dto.brandId,
            name: { equals: dto.name, mode: "insensitive" },
          },
        ],
      },
    });
    if (existing)
      throw new BadRequestException(
        "Bu isimde veya slug ile bir model zaten mevcut",
      );

    const model = await this.prisma.carModel.create({
      data: {
        brandId: dto.brandId,
        name: dto.name,
        slug,
        yearStart: dto.yearStart,
        yearEnd: dto.yearEnd,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "car_model_create",
      "CarModel",
      model.id,
      null,
      model,
    );
    await this.cache.delPattern("car-models:*");
    return model;
  }

  async updateCarModel(
    adminId: string,
    id: string,
    dto: {
      name?: string;
      slug?: string;
      yearStart?: number;
      yearEnd?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.carModel.findUnique({
      where: { id },
      include: { brand: true },
    });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.carModel.notFound"));

    let slug = existing.slug;
    if (dto.slug) slug = dto.slug;
    else if (dto.name && dto.name !== existing.name) {
      slug = `${existing.brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
    }

    if (slug !== existing.slug) {
      const duplicate = await this.prisma.carModel.findFirst({
        where: { slug, NOT: { id } },
      });
      if (duplicate)
        throw new BadRequestException("Bu slug ile bir model zaten mevcut");
    }

    const updated = await this.prisma.carModel.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug || (dto.name ? slug : undefined),
        yearStart: dto.yearStart,
        yearEnd: dto.yearEnd,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "car_model_update",
      "CarModel",
      id,
      existing,
      updated,
    );
    await this.cache.delPattern("car-models:*");
    return updated;
  }

  async deleteCarModel(adminId: string, id: string) {
    const existing = await this.prisma.carModel.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.carModel.notFound"));
    await this.prisma.carModel.delete({ where: { id } });
    await this.audit.createAuditLog(
      adminId,
      "car_model_delete",
      "CarModel",
      id,
      existing,
      null,
    );
    await this.cache.delPattern("car-models:*");
    return { success: true };
  }

  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================

  /**
   * Get attribute groups with their attributes
   */
  async getAttributeGroups(query: AdminAttributeGroupQueryDto) {
    const { search, isActive } = query;
    const where: Prisma.AttributeGroupWhereInput = {};

    if (search) {
      const ids = await fulltextAttributeGroupSearch(this.prisma, search);
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const orderBy =
      resolveOrderBy<Prisma.AttributeGroupOrderByWithRelationInput>(
        "AttributeGroup",
        query,
        { defaultSort: { sortOrder: "asc" } },
      );
    const result = await paginate(
      this.prisma.attributeGroup,
      {
        where,
        include: {
          attributes: {
            orderBy: { sortOrder: "asc" },
          },
          _count: { select: { attributes: true } },
        },
        orderBy,
      },
      query,
    );

    return {
      ...result,
      data: result.data.map((g) => ({
        ...g,
        attributeCount: g._count.attributes,
      })),
    };
  }

  /**
   * Get attribute group by ID
   */
  async getAttributeGroupById(groupId: string) {
    const group = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
      include: {
        attributes: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { productAttributes: true } },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(
        i18nMessage("server.admin.catalog.attributeGroupNotFound"),
      );
    }

    return {
      ...group,
      attributeCount: group.attributes.length,
      attributes: group.attributes.map((a) => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
    };
  }

  /**
   * Create attribute group
   */
  async createAttributeGroup(
    adminId: string,
    dto: {
      name: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const slug = generateSlug(dto.name);

    const existing = await this.prisma.attributeGroup.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });

    if (existing) {
      throw new BadRequestException(
        i18nMessage("server.admin.catalog.attributeGroupExists"),
      );
    }

    const group = await this.prisma.attributeGroup.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        isRequired: dto.isRequired ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "attribute_group_create",
      "AttributeGroup",
      group.id,
      null,
      group,
    );

    return { ...group, attributeCount: 0 };
  }

  /**
   * Update attribute group
   */
  async updateAttributeGroup(
    adminId: string,
    groupId: string,
    dto: {
      name?: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      throw new NotFoundException(
        i18nMessage("server.admin.catalog.attributeGroupNotFound"),
      );
    }

    const updateData: Prisma.AttributeGroupUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      updateData.slug = generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isRequired !== undefined) updateData.isRequired = dto.isRequired;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    const updated = await this.prisma.attributeGroup.update({
      where: { id: groupId },
      data: updateData,
      include: { _count: { select: { attributes: true } } },
    });

    await this.audit.createAuditLog(
      adminId,
      "attribute_group_update",
      "AttributeGroup",
      groupId,
      existing,
      updated,
    );

    return { ...updated, attributeCount: updated._count.attributes };
  }

  /**
   * Delete attribute group
   */
  async deleteAttributeGroup(adminId: string, groupId: string) {
    const existing = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
      include: { _count: { select: { attributes: true } } },
    });

    if (!existing) {
      throw new NotFoundException(
        i18nMessage("server.admin.catalog.attributeGroupNotFound"),
      );
    }

    if (existing._count.attributes > 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.catalog.attributeGroupInUse", {
          count: existing._count.attributes,
        }),
      );
    }

    await this.prisma.attributeGroup.delete({
      where: { id: groupId },
    });

    await this.audit.createAuditLog(
      adminId,
      "attribute_group_delete",
      "AttributeGroup",
      groupId,
      existing,
      null,
    );

    return { success: true };
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================

  /**
   * Get attributes with filtering
   */
  async getAttributes(query: AdminAttributeQueryDto) {
    const { groupId, search, isActive } = query;
    const where: Prisma.AttributeWhereInput = {};

    if (groupId) where.groupId = groupId;
    if (search) {
      const ids = await fulltextAttributeSearch(this.prisma, search);
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const orderBy = resolveOrderBy<
      | Prisma.AttributeOrderByWithRelationInput
      | Prisma.AttributeOrderByWithRelationInput[]
    >("Attribute", query, {
      defaultSort: [{ groupId: "asc" }, { sortOrder: "asc" }],
    });
    const result = await paginate(
      this.prisma.attribute,
      {
        where,
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { productAttributes: true } },
        },
        orderBy,
      },
      query,
    );

    return {
      ...result,
      data: result.data.map((a) => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
    };
  }

  /**
   * Create attribute value
   */
  async createAttribute(
    adminId: string,
    dto: {
      groupId: string;
      value: string;
      displayValue?: string;
      color?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    // Verify group exists
    const group = await this.prisma.attributeGroup.findUnique({
      where: { id: dto.groupId },
    });

    if (!group) {
      throw new NotFoundException(
        i18nMessage("server.admin.catalog.attributeGroupNotFound"),
      );
    }

    // Scale group: use same slug normalization as product.service linkProductAttributes
    const slug =
      group.slug === SCALE_GROUP_SLUG
        ? dto.value.replace(/\s/g, "").replace(/[:\/]/g, "").toLowerCase() ||
          generateSlug(dto.value)
        : generateSlug(dto.value);

    // Check for duplicate
    const existing = await this.prisma.attribute.findFirst({
      where: { groupId: dto.groupId, slug },
    });

    if (existing) {
      throw new BadRequestException(
        i18nMessage("server.admin.catalog.attributeValueExists"),
      );
    }

    const attribute = await this.prisma.attribute.create({
      data: {
        groupId: dto.groupId,
        value: dto.value,
        slug,
        displayValue: dto.displayValue?.trim() || null,
        color: dto.color || null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "attribute_create",
      "Attribute",
      attribute.id,
      null,
      attribute,
    );

    return { ...attribute, usageCount: 0 };
  }

  /**
   * Update attribute value
   */
  async updateAttribute(
    adminId: string,
    attributeId: string,
    dto: {
      value?: string;
      displayValue?: string;
      color?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
    });

    if (!existing) {
      throw new NotFoundException(
        i18nMessage("server.admin.catalog.attributeNotFound"),
      );
    }

    const updateData: Prisma.AttributeUpdateInput = {};
    if (dto.value !== undefined) {
      updateData.value = dto.value;
      const group = await this.prisma.attributeGroup.findUnique({
        where: { id: existing.groupId },
      });
      updateData.slug =
        group?.slug === SCALE_GROUP_SLUG
          ? dto.value.replace(/\s/g, "").replace(/[:\/]/g, "").toLowerCase() ||
            generateSlug(dto.value)
          : generateSlug(dto.value);
    }
    if (dto.displayValue !== undefined)
      updateData.displayValue = dto.displayValue?.trim() || null;
    // Boş dize/null = rengi temizle. Eskiden yalnız atama vardı: modal boş
    // gönderdiğinde alan aynen kalıyor, bir kez verilen hex geri alınamıyordu.
    if (dto.color !== undefined) updateData.color = dto.color || null;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.prisma.attribute.update({
      where: { id: attributeId },
      data: updateData,
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { productAttributes: true } },
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "attribute_update",
      "Attribute",
      attributeId,
      existing,
      updated,
    );

    return { ...updated, usageCount: updated._count.productAttributes };
  }

  /**
   * Delete attribute value
   */
  async deleteAttribute(adminId: string, attributeId: string) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
      include: { _count: { select: { productAttributes: true } } },
    });

    if (!existing) {
      throw new NotFoundException(
        i18nMessage("server.admin.catalog.attributeNotFound"),
      );
    }

    if (existing._count.productAttributes > 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.catalog.attributeInUse", {
          count: existing._count.productAttributes,
        }),
      );
    }

    await this.prisma.attribute.delete({
      where: { id: attributeId },
    });

    await this.audit.createAuditLog(
      adminId,
      "attribute_delete",
      "Attribute",
      attributeId,
      existing,
      null,
    );

    return { success: true };
  }
}
