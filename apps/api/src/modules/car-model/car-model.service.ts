import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";

@Injectable()
export class CarModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Get all active car models with product counts, grouped by brand
   */
  async findAll(brandSlug?: string) {
    const cacheKey = `car-models:all:${brandSlug || "all"}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const where: any = { isActive: true };
        if (brandSlug) {
          where.brand = { slug: brandSlug };
        }

        const models = await this.prisma.carModel.findMany({
          where,
          orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
          include: {
            brand: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
                country: true,
              },
            },
            _count: {
              select: {
                products: {
                  where: {
                    ...catalogProductWhere(),
                    status: "active",
                  },
                },
              },
            },
          },
        });

        return models.map((m) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          image: m.image,
          description: m.description,
          yearStart: m.yearStart,
          yearEnd: m.yearEnd,
          brand: m.brand,
          productCount: m._count.products,
        }));
      },
      { ttl: 1800 },
    );
  }

  /**
   * Get car model by slug
   */
  async findBySlug(slug: string) {
    const cacheKey = `car-models:slug:${slug}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const model = await this.prisma.carModel.findUnique({
          where: { slug },
          include: {
            brand: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
                country: true,
              },
            },
            _count: {
              select: {
                products: {
                  where: {
                    ...catalogProductWhere(),
                    status: "active",
                  },
                },
              },
            },
          },
        });

        if (!model) {
          throw new NotFoundException("Model bulunamadı");
        }

        return {
          id: model.id,
          name: model.name,
          slug: model.slug,
          image: model.image,
          description: model.description,
          yearStart: model.yearStart,
          yearEnd: model.yearEnd,
          brand: model.brand,
          productCount: model._count.products,
        };
      },
      { ttl: 1800 },
    );
  }
}
