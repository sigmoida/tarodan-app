import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { CacheService } from '../cache/cache.service';
import { AdminAuditService } from './admin-audit.service';
import { generateSlug } from './admin-slug.util';
import {
  fulltextAttributeGroupSearch,
  fulltextAttributeSearch,
} from '../../common/helpers/fulltext-search';
import { Prisma, Brand } from '@prisma/client';

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

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if ((imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://')) && imageKeyOrUrl.includes('X-Amz-Signature')) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = '';
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
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
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: true,
        children: { orderBy: { name: 'asc' } },
        _count: {
          select: { products: true, collections: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      data: categories.map((c) => ({
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
        collectionCount: c._count.collections,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Create category
   */
  async createCategory(adminId: string, dto: {
    name: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Check if parent exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Üst kategori bulunamadı');
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
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    // Create audit log
    await this.audit.createAuditLog(adminId, 'category_create', 'Category', category.id, null, category);

    return category;
  }

  /**
   * Update category
   */
  async updateCategory(adminId: string, categoryId: string, dto: {
    name?: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check circular reference if parentId is being changed
    if (dto.parentId && dto.parentId !== category.parentId) {
      // Check if new parent is a child of this category
      const isChild = category.children.some((child) => child.id === dto.parentId);
      if (isChild) {
        throw new BadRequestException('Kategori kendi alt kategorisini üst kategori olarak seçemez');
      }

      // Check if new parent exists
      const newParent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!newParent) {
        throw new NotFoundException('Üst kategori bulunamadı');
      }
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
        description: dto.description !== undefined ? (dto.description || null) : undefined,
        parentId: dto.parentId !== undefined ? (dto.parentId || null) : undefined, // Empty string becomes null
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // Create audit log
    await this.audit.createAuditLog(adminId, 'category_update', 'Category', categoryId, oldCategory, updatedCategory);

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
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check if category has products
    if (category._count.products > 0) {
      throw new BadRequestException('Bu kategoride ürünler bulunmaktadır. Önce ürünleri başka kategoriye taşıyın.');
    }

    // Check if category has children
    if (category.children.length > 0) {
      throw new BadRequestException('Bu kategorinin alt kategorileri bulunmaktadır. Önce alt kategorileri silin.');
    }

    await this.prisma.category.delete({
      where: { id: categoryId },
    });

    // Create audit log
    await this.audit.createAuditLog(adminId, 'category_delete', 'Category', categoryId, category, null);

    return { success: true, categoryId };
  }

  // ==================== BRAND MANAGEMENT ====================

  /**
   * Get all brands
   */
  async getBrands() {
    const brands = await this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      data: brands.map((b: Brand) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo: b.logo,
        description: b.description,
        website: b.website,
        country: b.country,
        foundedYear: b.foundedYear,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    };
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
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Check if brand with same name or slug exists
    const existing = await this.prisma.brand.findFirst({
      where: {
        OR: [
          { name: { equals: dto.name, mode: 'insensitive' } },
          { slug },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir marka zaten mevcut');
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
    await this.audit.createAuditLog(adminId, 'brand_create', 'Brand', brand.id, null, brand);

    this.logger.log(`Brand created: ${brand.name} (${brand.id}) by admin ${adminId}`);

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
      throw new NotFoundException('Marka bulunamadı');
    }

    // If name is being changed, check for duplicates and update slug
    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const duplicate = await this.prisma.brand.findFirst({
        where: {
          OR: [
            { name: { equals: dto.name, mode: 'insensitive' } },
            { slug },
          ],
          NOT: { id: brandId },
        },
      });

      if (duplicate) {
        throw new BadRequestException('Bu isimde bir marka zaten mevcut');
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
    await this.audit.createAuditLog(adminId, 'brand_update', 'Brand', brandId, existing, updated);

    this.logger.log(`Brand updated: ${updated.name} (${updated.id}) by admin ${adminId}`);

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
      throw new NotFoundException('Marka bulunamadı');
    }

    const { products: productCount, carModels: carModelCount } = (existing as any)._count;
    if (productCount > 0 || carModelCount > 0) {
      throw new ConflictException(
        `Bu marka silinemez: ${productCount} ürün ve ${carModelCount} araç modeli ile ilişkili.`,
      );
    }

    await this.prisma.brand.delete({
      where: { id: brandId },
    });

    // Create audit log
    await this.audit.createAuditLog(adminId, 'brand_delete', 'Brand', brandId, existing, null);

    this.logger.log(`Brand deleted: ${existing.name} (${existing.id}) by admin ${adminId}`);

    return { success: true };
  }

  // ==================== MANUFACTURER MANAGEMENT ====================

  async getManufacturers() {
    const manufacturers = await this.prisma.manufacturer.findMany({
      orderBy: { name: 'asc' },
    });
    return {
      data: manufacturers.map(m => ({
        ...m,
        logo: this.resolveProductImageUrl(m.logo),
      })),
    };
  }

  async createManufacturer(
    adminId: string,
    dto: { name: string; logo?: string; description?: string; website?: string; country?: string; foundedYear?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const existing = await this.prisma.manufacturer.findFirst({
      where: { OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }] },
    });
    if (existing) throw new BadRequestException('Bu isimde bir üretici zaten mevcut');

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
    await this.audit.createAuditLog(adminId, 'manufacturer_create', 'Manufacturer', manufacturer.id, null, manufacturer);
    return manufacturer;
  }

  async updateManufacturer(
    adminId: string,
    id: string,
    dto: { name?: string; logo?: string; description?: string; website?: string; country?: string; foundedYear?: number | null; sortOrder?: number; isActive?: boolean },
  ) {
    const existing = await this.prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Üretici bulunamadı');

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = dto.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
      const duplicate = await this.prisma.manufacturer.findFirst({
        where: { OR: [{ name: { equals: dto.name, mode: 'insensitive' } }, { slug }], NOT: { id } },
      });
      if (duplicate) throw new BadRequestException('Bu isimde bir üretici zaten mevcut');
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
    await this.audit.createAuditLog(adminId, 'manufacturer_update', 'Manufacturer', id, existing, updated);
    return updated;
  }

  async deleteManufacturer(adminId: string, id: string) {
    const existing = await this.prisma.manufacturer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Üretici bulunamadı');
    await this.prisma.manufacturer.delete({ where: { id } });
    await this.audit.createAuditLog(adminId, 'manufacturer_delete', 'Manufacturer', id, existing, null);
    return { success: true };
  }

  // ==================== CAR MODEL MANAGEMENT ====================

  // #101: opsiyonel server-pagination. page/limit VERİLİRSE (admin liste sayfası)
  // sayfalar; VERİLMEZSE (product/car-model filtre dropdown'ları, BrandModelsPanel)
  // tüm listeyi döndürür — mevcut tüketiciler kırılmaz.
  async getCarModels(params?: { brandId?: string; page?: number; limit?: number; search?: string }) {
    const { brandId, page, limit, search } = params ?? {};
    const where: Record<string, unknown> = {};
    if (brandId) where.brandId = brandId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { brand: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const orderBy = [{ brand: { name: 'asc' as const } }, { name: 'asc' as const }];
    const include = { brand: { select: { id: true, name: true, slug: true } } };

    if (page === undefined && limit === undefined) {
      const models = await this.prisma.carModel.findMany({ where, orderBy, include });
      return { data: models };
    }

    const p = page ?? 1;
    const l = limit ?? 20;
    const [total, models] = await Promise.all([
      this.prisma.carModel.count({ where }),
      this.prisma.carModel.findMany({ where, orderBy, include, skip: (p - 1) * l, take: l }),
    ]);
    return { data: models, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  async createCarModel(
    adminId: string,
    dto: { brandId: string; name: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadı');

    const slug =
      dto.slug ||
      `${brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

    const existing = await this.prisma.carModel.findFirst({
      where: { OR: [{ slug }, { brandId: dto.brandId, name: { equals: dto.name, mode: 'insensitive' } }] },
    });
    if (existing) throw new BadRequestException('Bu isimde veya slug ile bir model zaten mevcut');

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
    await this.audit.createAuditLog(adminId, 'car_model_create', 'CarModel', model.id, null, model);
    await this.cache.delPattern('car-models:*');
    return model;
  }

  async updateCarModel(
    adminId: string,
    id: string,
    dto: { name?: string; slug?: string; yearStart?: number; yearEnd?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const existing = await this.prisma.carModel.findUnique({ where: { id }, include: { brand: true } });
    if (!existing) throw new NotFoundException('Model bulunamadı');

    let slug = existing.slug;
    if (dto.slug) slug = dto.slug;
    else if (dto.name && dto.name !== existing.name) {
      slug = `${existing.brand.slug}-${dto.name}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }

    if (slug !== existing.slug) {
      const duplicate = await this.prisma.carModel.findFirst({ where: { slug, NOT: { id } } });
      if (duplicate) throw new BadRequestException('Bu slug ile bir model zaten mevcut');
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
    await this.audit.createAuditLog(adminId, 'car_model_update', 'CarModel', id, existing, updated);
    await this.cache.delPattern('car-models:*');
    return updated;
  }

  async deleteCarModel(adminId: string, id: string) {
    const existing = await this.prisma.carModel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Model bulunamadı');
    await this.prisma.carModel.delete({ where: { id } });
    await this.audit.createAuditLog(adminId, 'car_model_delete', 'CarModel', id, existing, null);
    await this.cache.delPattern('car-models:*');
    return { success: true };
  }

  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================

  /**
   * Get attribute groups with their attributes
   */
  async getAttributeGroups(query: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, search, isActive } = query;
    const where: Prisma.AttributeGroupWhereInput = {};

    if (search) {
      const ids = await fulltextAttributeGroupSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [total, groups] = await Promise.all([
      this.prisma.attributeGroup.count({ where }),
      this.prisma.attributeGroup.findMany({
        where,
        include: {
          attributes: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { attributes: true } },
        },
        orderBy: { sortOrder: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: groups.map(g => ({
        ...g,
        attributeCount: g._count.attributes,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { productAttributes: true } },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    return {
      ...group,
      attributeCount: group.attributes.length,
      attributes: group.attributes.map(a => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
    };
  }

  /**
   * Create attribute group
   */
  async createAttributeGroup(adminId: string, dto: {
    name: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const slug = generateSlug(dto.name);

    const existing = await this.prisma.attributeGroup.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir özellik grubu zaten mevcut');
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

    await this.audit.createAuditLog(adminId, 'attribute_group_create', 'AttributeGroup', group.id, null, group);

    return { ...group, attributeCount: 0 };
  }

  /**
   * Update attribute group
   */
  async updateAttributeGroup(adminId: string, groupId: string, dto: {
    name?: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const existing = await this.prisma.attributeGroup.findUnique({
      where: { id: groupId },
    });

    if (!existing) {
      throw new NotFoundException('Özellik grubu bulunamadı');
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

    await this.audit.createAuditLog(adminId, 'attribute_group_update', 'AttributeGroup', groupId, existing, updated);

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
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    if (existing._count.attributes > 0) {
      throw new BadRequestException(`Bu grupta ${existing._count.attributes} özellik değeri var. Önce değerleri silin.`);
    }

    await this.prisma.attributeGroup.delete({
      where: { id: groupId },
    });

    await this.audit.createAuditLog(adminId, 'attribute_group_delete', 'AttributeGroup', groupId, existing, null);

    return { success: true };
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================

  /**
   * Get attributes with filtering
   */
  async getAttributes(query: {
    groupId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, groupId, search, isActive } = query;
    const where: Prisma.AttributeWhereInput = {};

    if (groupId) where.groupId = groupId;
    if (search) {
      const ids = await fulltextAttributeSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (isActive !== undefined) where.isActive = isActive;

    const [total, attributes] = await Promise.all([
      this.prisma.attribute.count({ where }),
      this.prisma.attribute.findMany({
        where,
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { productAttributes: true } },
        },
        orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: attributes.map(a => ({
        ...a,
        usageCount: a._count.productAttributes,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create attribute value
   */
  async createAttribute(adminId: string, dto: {
    groupId: string;
    value: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Verify group exists
    const group = await this.prisma.attributeGroup.findUnique({
      where: { id: dto.groupId },
    });

    if (!group) {
      throw new NotFoundException('Özellik grubu bulunamadı');
    }

    // Scale group: use same slug normalization as product.service linkProductAttributes
    const slug =
      group.slug === 'scale'
        ? dto.value.replace(/\s/g, '').replace(/[:\/]/g, '').toLowerCase() || generateSlug(dto.value)
        : generateSlug(dto.value);

    // Check for duplicate
    const existing = await this.prisma.attribute.findFirst({
      where: { groupId: dto.groupId, slug },
    });

    if (existing) {
      throw new BadRequestException('Bu değer bu grupta zaten mevcut');
    }

    const attribute = await this.prisma.attribute.create({
      data: {
        groupId: dto.groupId,
        value: dto.value,
        slug,
        displayValue: dto.displayValue?.trim() || null,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    await this.audit.createAuditLog(adminId, 'attribute_create', 'Attribute', attribute.id, null, attribute);

    return { ...attribute, usageCount: 0 };
  }

  /**
   * Update attribute value
   */
  async updateAttribute(adminId: string, attributeId: string, dto: {
    value?: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
    });

    if (!existing) {
      throw new NotFoundException('Özellik değeri bulunamadı');
    }

    const updateData: Prisma.AttributeUpdateInput = {};
    if (dto.value !== undefined) {
      updateData.value = dto.value;
      const group = await this.prisma.attributeGroup.findUnique({ where: { id: existing.groupId } });
      updateData.slug =
        group?.slug === 'scale'
          ? dto.value.replace(/\s/g, '').replace(/[:\/]/g, '').toLowerCase() || generateSlug(dto.value)
          : generateSlug(dto.value);
    }
    if (dto.displayValue !== undefined) updateData.displayValue = dto.displayValue?.trim() || null;
    if (dto.color !== undefined) updateData.color = dto.color;
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

    await this.audit.createAuditLog(adminId, 'attribute_update', 'Attribute', attributeId, existing, updated);

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
      throw new NotFoundException('Özellik değeri bulunamadı');
    }

    if (existing._count.productAttributes > 0) {
      throw new BadRequestException(`Bu özellik ${existing._count.productAttributes} üründe kullanılıyor. Önce ürünlerden kaldırın.`);
    }

    await this.prisma.attribute.delete({
      where: { id: attributeId },
    });

    await this.audit.createAuditLog(adminId, 'attribute_delete', 'Attribute', attributeId, existing, null);

    return { success: true };
  }

}
