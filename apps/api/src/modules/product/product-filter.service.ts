import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';

/**
 * ProductFilterService — dinamik filtre/öznitelik metadatası (kategori/marka/ölçek/
 * malzeme/üretici + üretici-kapsamlı attribute grupları). Ürün DÖNDÜRMEZ; bu yüzden
 * ProductQueryService'ten ayrıldı (query 12 metotla >800 satır olurdu; <800 sabit
 * gereksinim). Leaf; yalnız prisma.
 */
@Injectable()
export class ProductFilterService {
  private readonly logger = new Logger(ProductFilterService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Get dynamic filters (categories, brands, etc.)
   * When `manufacturer` slug is provided, also returns manufacturer-scoped attribute
   * groups in `customAttributes` (e.g. Hot Wheels Segment/Assortment/Wheel Type).
   */
  async getFilters(manufacturer?: string) {
    // 1. Categories
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, parentId: true },
      orderBy: { name: 'asc' },
    });

    // 2. Brands (id, name, slug – same format as manufacturers)
    const brands = await this.prisma.brand.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });

    // 3. Scales (from Attribute group "scale") & Manufacturers (from DB)
    const scaleAttrs = await this.prisma.attribute.findMany({
      where: {
        isActive: true,
        group: { slug: 'scale', isActive: true },
      },
      select: { value: true, slug: true, displayValue: true },
      orderBy: { sortOrder: 'asc' },
    });
    const scales = scaleAttrs.length > 0
      ? scaleAttrs.map((a) => a.displayValue || a.value)
      : ['1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36', '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200'];

    const manufacturerRecords = await this.prisma.manufacturer.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { sortOrder: 'asc' },
    });
    const manufacturers = manufacturerRecords.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
    }));

    // 4. Materials (from Attribute group "material" - Malzeme)
    const materialAttrs = await this.prisma.attribute.findMany({
      where: {
        isActive: true,
        group: { slug: 'material', isActive: true },
      },
      select: { slug: true, displayValue: true, value: true },
      orderBy: { sortOrder: 'asc' },
    });
    const materials = materialAttrs.map((a) => ({
      slug: a.slug,
      label: a.displayValue || a.value,
    }));

    // 5. Car models (id, name, slug, brandId – for filter dropdown, brand-specific)
    const carModels = await this.prisma.carModel.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, brandId: true },
      orderBy: [{ brandId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    // 6. Manufacturer-scoped custom attribute groups (e.g. Hot Wheels).
    //    Empty array when no manufacturer or no scoped groups exist.
    //    Global groups (scale, material) are NOT duplicated here — they're already above.
    const customAttributes = manufacturer
      ? await this.prisma.attributeGroup.findMany({
          where: { isActive: true, manufacturerSlug: manufacturer },
          include: {
            attributes: {
              where: { isActive: true },
              select: { slug: true, value: true, displayValue: true, color: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        })
      : [];

    return {
      categories: categories.map(c => ({ value: c.id, label: c.name, slug: c.slug, parentId: c.parentId })),
      brands: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
      carModels: carModels.map((m) => ({ id: m.id, name: m.name, slug: m.slug, brandId: m.brandId })),
      scales,
      manufacturers,
      materials: materials.length > 0 ? materials : [
        { slug: 'diecast', label: 'Diecast (Metal)' },
        { slug: 'resin', label: 'Resin (Reçine)' },
        { slug: 'composite', label: 'Composite (Kompozit)' },
        { slug: 'plastic', label: 'Plastic (Plastik)' },
      ],
      customAttributes: customAttributes.map((g) => ({
        slug: g.slug,
        name: g.name,
        manufacturerSlug: g.manufacturerSlug,
        attributes: g.attributes.map((a) => ({
          slug: a.slug,
          label: a.displayValue || a.value,
          color: a.color,
        })),
      })),
    };
  }

  /**
   * Get attribute groups applicable to a manufacturer (or global only if no manufacturer).
   * Used by listing forms to render conditional fields (e.g. Hot Wheels-only filters).
   *
   * Returns global groups (manufacturerSlug=null) always; adds manufacturer-scoped
   * groups when manufacturer slug is provided.
   */
  async getAttributeGroupsForManufacturer(manufacturer?: string) {
    const groups = await this.prisma.attributeGroup.findMany({
      where: {
        isActive: true,
        OR: [
          { manufacturerSlug: null },
          ...(manufacturer ? [{ manufacturerSlug: manufacturer }] : []),
        ],
      },
      include: {
        attributes: {
          where: { isActive: true },
          select: { slug: true, value: true, displayValue: true, color: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return groups.map((g) => ({
      slug: g.slug,
      name: g.name,
      description: g.description,
      isRequired: g.isRequired,
      manufacturerSlug: g.manufacturerSlug,
      attributes: g.attributes.map((a) => ({
        slug: a.slug,
        label: a.displayValue || a.value,
        color: a.color,
      })),
    }));
  }
}
