import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class BrandService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: CacheService,
    ) { }

    /**
     * Get all active brands with product counts
     */
    async findAll() {
        const cacheKey = 'brands:all';

        return this.cache.getOrSet(
            cacheKey,
            async () => {
                const brands = await this.prisma.brand.findMany({
                    where: { isActive: true },
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        _count: {
                            select: {
                                products: { where: { status: 'active' } },
                            },
                        },
                    },
                });

                return brands.map((brand) => ({
                    id: brand.id,
                    name: brand.name,
                    slug: brand.slug,
                    logo: brand.logo,
                    description: brand.description,
                    country: brand.country,
                    foundedYear: brand.foundedYear,
                    productCount: brand._count.products,
                }));
            },
            { ttl: 3600 }, // 1 hour cache
        );
    }

    /**
     * Get brand by slug with product count
     */
    async findBySlug(slug: string) {
        const cacheKey = `brands:slug:${slug}`;

        return this.cache.getOrSet(
            cacheKey,
            async () => {
                const brand = await this.prisma.brand.findUnique({
                    where: { slug },
                    include: {
                        _count: {
                            select: {
                                products: { where: { status: 'active' } },
                            },
                        },
                    },
                });

                if (!brand) {
                    throw new NotFoundException('Marka bulunamadı');
                }

                return {
                    id: brand.id,
                    name: brand.name,
                    slug: brand.slug,
                    logo: brand.logo,
                    description: brand.description,
                    website: brand.website,
                    country: brand.country,
                    foundedYear: brand.foundedYear,
                    productCount: brand._count.products,
                };
            },
            { ttl: 1800 }, // 30 min cache
        );
    }

    /**
     * Get brand by ID
     */
    async findOne(id: string) {
        const brand = await this.prisma.brand.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        products: { where: { status: 'active' } },
                    },
                },
            },
        });

        if (!brand) {
            throw new NotFoundException('Marka bulunamadı');
        }

        return {
            id: brand.id,
            name: brand.name,
            slug: brand.slug,
            logo: brand.logo,
            description: brand.description,
            website: brand.website,
            country: brand.country,
            foundedYear: brand.foundedYear,
            productCount: brand._count.products,
        };
    }
}
