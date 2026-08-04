import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ProductKind, ProductStatus } from "@prisma/client";
import { saleCapableSellerWhere } from "../membership/membership.util";
import { saleCapableEsFilters } from "./sale-capable-es-filter";
import { StorageService } from "../storage/storage.service";
import { resolveBrandLogoUrl } from "../brand/brand-logo-url";
import { fulltextProductSearch } from "../product/helpers/fulltext-search";
import {
  fulltextBrandSearch,
  fulltextCategorySearch,
  fulltextCarModelSearch,
  fulltextManufacturerSearch,
  fulltextAttributeSearch,
} from "../../common/helpers/fulltext-search";
import { SearchCommonService } from "./search-common.service";

/**
 * Otomatik tamamlama alt servisi (search.service.ts'ten birebir taşındı):
 * autocomplete, fallbackAutocomplete, autocompleteRich ve richAutocomplete*
 * (products/brands/categories/manufacturers/carModels/scales/materials/
 * conditions). Paylaşılan ES client'ı + bayraklar + exclusion helper'ları için
 * SearchCommonService'e delege eder.
 */
@Injectable()
export class SearchAutocompleteService {
  private readonly logger = new Logger(SearchAutocompleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly common: SearchCommonService,
  ) {}

  // ──────────────────────────── Autocomplete ────────────────────────────

  async autocomplete(query: string, limit = 10): Promise<string[]> {
    if (!this.common.isAvailable())
      return this.fallbackAutocomplete(query, limit);

    try {
      const response = await this.common.client.search({
        index: this.common.productsIndex,
        query: {
          bool: {
            should: [
              { match: { "title.edge_ngram": { query, boost: 4 } } },
              { match: { "title.ngram": { query, boost: 2 } } },
              {
                multi_match: {
                  query,
                  type: "phrase_prefix",
                  fields: [
                    "title^2",
                    "categoryName",
                    "manufacturerName",
                    "brandName",
                  ],
                  boost: 3,
                },
              },
              {
                fuzzy: {
                  title: {
                    value: query.toLowerCase(),
                    fuzziness: "AUTO",
                    prefix_length: 1,
                    boost: 1.5,
                  },
                },
              },
              {
                multi_match: {
                  query,
                  fields: ["title^2", "categoryName", "manufacturerName"],
                  fuzziness: 2,
                  prefix_length: 1,
                  boost: 1,
                },
              },
            ],
            minimum_should_match: 1,
            filter: [
              { term: { status: ProductStatus.active } },
              ...saleCapableEsFilters(),
              { term: { productKind: ProductKind.listing } },
            ],
          },
        },
        _source: ["title"],
        size: limit * 2,
        collapse: { field: "title.keyword" },
      });

      return response.hits.hits
        .map((hit: any) => hit._source.title)
        .slice(0, limit);
    } catch (error) {
      this.logger.warn("Elasticsearch autocomplete error, using fallback");
      return this.fallbackAutocomplete(query, limit);
    }
  }

  private async fallbackAutocomplete(
    query: string,
    limit: number,
  ): Promise<string[]> {
    const productIds = await fulltextProductSearch(this.prisma, query, limit);
    if (productIds.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        status: ProductStatus.active,
        seller: saleCapableSellerWhere(),
        kind: ProductKind.listing,
      },
      select: { title: true },
      take: limit,
      distinct: ["title"],
    });
    return products.map((p) => p.title);
  }

  // ──────────────────────────── Rich Autocomplete ────────────────────────────

  async autocompleteRich(query: string): Promise<{
    products: Array<{
      id: string;
      title: string;
      imageUrl?: string;
      price: number;
      brandName?: string;
    }>;
    brands: Array<{
      id: string;
      name: string;
      slug: string;
      logo?: string | null;
    }>;
    categories: Array<{ id: string; name: string; slug: string }>;
    manufacturers: Array<{
      id: string;
      name: string;
      slug: string;
      logo?: string | null;
    }>;
    carModels: Array<{
      id: string;
      name: string;
      slug: string;
      brandId: string;
    }>;
    scales: string[];
    materials: Array<{ slug: string; label: string }>;
    conditions: Array<{ value: string; label: string }>;
    suggestions: string[];
  }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        products: [],
        brands: [],
        categories: [],
        manufacturers: [],
        carModels: [],
        scales: [],
        materials: [],
        conditions: [],
        suggestions: [],
      };
    }

    // Same pattern as brands/categories/manufacturers: direct search per entity type
    const [
      products,
      brands,
      categories,
      manufacturers,
      carModels,
      scales,
      materials,
      conditions,
      suggestions,
    ] = await Promise.all([
      this.richAutocompleteProducts(trimmed, 5),
      this.richAutocompleteBrands(trimmed, 3),
      this.richAutocompleteCategories(trimmed, 3),
      this.richAutocompleteManufacturers(trimmed, 3),
      this.richAutocompleteCarModels(trimmed, 5),
      this.richAutocompleteScales(trimmed, 5),
      this.richAutocompleteMaterials(trimmed, 5),
      this.richAutocompleteConditions(trimmed, 5),
      this.autocomplete(trimmed, 5),
    ]);

    return {
      products,
      brands,
      categories,
      manufacturers,
      carModels,
      scales,
      materials,
      conditions,
      suggestions,
    };
  }

  private async richAutocompleteProducts(
    query: string,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      title: string;
      imageUrl?: string;
      price: number;
      brandName?: string;
    }>
  > {
    if (this.common.isAvailable()) {
      try {
        const response = await this.common.client.search({
          index: this.common.productsIndex,
          query: {
            bool: {
              should: [
                { match: { "title.edge_ngram": { query, boost: 4 } } },
                { match: { "title.ngram": { query, boost: 2 } } },
                { match: { carModelName: { query, boost: 2 } } },
                { match: { "carModelName.edge_ngram": { query, boost: 1 } } },
                { match: { "carModelName.ngram": { query, boost: 2 } } },
                {
                  match_phrase_prefix: {
                    carModelName: { query, boost: 2, max_expansions: 20 },
                  },
                },
                {
                  multi_match: {
                    query,
                    type: "phrase_prefix",
                    fields: [
                      "title^2",
                      "categoryName",
                      "manufacturerName",
                      "brandName",
                      "carModelName^2",
                    ],
                    boost: 3,
                  },
                },
                {
                  fuzzy: {
                    title: {
                      value: query.toLowerCase(),
                      fuzziness: "AUTO",
                      prefix_length: 1,
                      boost: 1.5,
                    },
                  },
                },
              ],
              minimum_should_match: 1,
              filter: [
                { term: { status: ProductStatus.active } },
                ...saleCapableEsFilters(),
                { term: { productKind: ProductKind.listing } },
              ],
            },
          },
          _source: ["id", "title", "imageUrl", "price", "brandName"],
          size: limit,
        });

        return response.hits.hits.map((hit: any) => ({
          id: hit._source.id,
          title: hit._source.title,
          imageUrl: hit._source.imageUrl,
          price: hit._source.price,
          brandName: hit._source.brandName,
        }));
      } catch (err) {
        this.logger.warn(
          `Autocomplete products ES failed, using Prisma fallback: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Prisma fallback – tsvector search for product IDs, then hydrate (only title+description)
    const productIds = await fulltextProductSearch(this.prisma, query, limit);
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: {
              id: { in: productIds },
              status: ProductStatus.active,
              seller: saleCapableSellerWhere(),
              kind: ProductKind.listing,
            },
            select: {
              id: true,
              title: true,
              price: true,
              images: {
                take: 1,
                orderBy: { sortOrder: "asc" as const },
                select: { cardKey: true },
              },
              brand: { select: { name: true } },
            },
            take: limit,
          })
        : [];

    return products.map((p) => ({
      id: p.id,
      title: p.title,
      imageUrl: p.images[0]?.cardKey
        ? this.storageService.getPublicAssetUrl(p.images[0].cardKey)
        : undefined,
      price: parseFloat(p.price.toString()),
      brandName: (p as any).brand?.name,
    }));
  }

  // Known car brands for autocomplete (matched against product titles / brand relation)
  private static readonly KNOWN_CAR_BRANDS = [
    "Audi",
    "Alfa Romeo",
    "BMW",
    "Chevrolet",
    "Dodge",
    "Ferrari",
    "Ford",
    "Honda",
    "Jaguar",
    "Lamborghini",
    "Land Rover",
    "Maserati",
    "McLaren",
    "Mercedes-Benz",
    "Nissan",
    "Porsche",
    "Subaru",
    "Tesla",
    "Toyota",
    "Volkswagen",
    "Aston Martin",
    "Bentley",
    "Bugatti",
    "Cadillac",
    "Citroën",
    "Fiat",
    "Hyundai",
    "Jeep",
    "Kia",
    "Lexus",
    "Mazda",
    "Mini",
    "Mitsubishi",
    "Opel",
    "Peugeot",
    "Renault",
    "Rolls-Royce",
    "Seat",
    "Škoda",
    "Volvo",
  ];

  private async richAutocompleteBrands(
    query: string,
    limit: number,
  ): Promise<
    Array<{ id: string; name: string; slug: string; logo?: string | null }>
  > {
    const brandIds = await fulltextBrandSearch(this.prisma, query, limit);

    if (brandIds.length > 0) {
      const brands = await this.prisma.brand.findMany({
        where: { id: { in: brandIds }, isActive: true },
        select: { id: true, name: true, slug: true, logo: true },
        take: limit,
        orderBy: { name: "asc" },
      });
      // Faz 1: logo S3 key taşır — istemciye URL çözümlenmiş döner.
      return brands.map((b) => ({ ...b, logo: this.resolveLogo(b.logo) }));
    }

    // Fallback: match against known car brands (static list)
    const lowerQ = query.toLowerCase();
    const matched = SearchAutocompleteService.KNOWN_CAR_BRANDS.filter((b) =>
      b.toLowerCase().includes(lowerQ),
    )
      .slice(0, limit)
      .map((name) => ({
        id: `brand-${name.toLowerCase().replace(/\s+/g, "-")}`,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        logo: null,
      }));
    return matched;
  }

  private async richAutocompleteCategories(
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    const categoryIds = await fulltextCategorySearch(this.prisma, query, limit);
    if (categoryIds.length === 0) return [];

    return this.prisma.category.findMany({
      where: { id: { in: categoryIds }, isActive: true },
      select: { id: true, name: true, slug: true },
      take: limit,
      orderBy: { name: "asc" },
    });
  }

  private async richAutocompleteManufacturers(
    query: string,
    limit: number,
  ): Promise<
    Array<{ id: string; name: string; slug: string; logo?: string | null }>
  > {
    const manufacturerIds = await fulltextManufacturerSearch(
      this.prisma,
      query,
      limit,
    );
    if (manufacturerIds.length === 0) return [];

    const manufacturers = await this.prisma.manufacturer.findMany({
      where: { id: { in: manufacturerIds } },
      select: { id: true, name: true, slug: true, logo: true },
      take: limit,
      orderBy: { name: "asc" },
    });
    return manufacturers.map((m) => ({
      ...m,
      logo: this.resolveLogo(m.logo),
    }));
  }

  /** Faz 1: logo S3 key'dir; URL tek yerden kurulur (eski "/" yolları null). */
  private resolveLogo(logo: string | null): string | null {
    return resolveBrandLogoUrl(logo, (key) =>
      this.storageService.getPublicAssetUrl(key),
    );
  }

  private async richAutocompleteCarModels(
    query: string,
    limit: number,
  ): Promise<
    Array<{ id: string; name: string; slug: string; brandId: string }>
  > {
    const ids = await fulltextCarModelSearch(this.prisma, query, limit);
    if (ids.length === 0) return [];

    return this.prisma.carModel.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, slug: true, brandId: true },
      take: limit,
      orderBy: { name: "asc" },
    });
  }

  private async richAutocompleteScales(
    query: string,
    limit: number,
  ): Promise<string[]> {
    const ids = await fulltextAttributeSearch(this.prisma, query, 50);
    if (ids.length === 0) return [];

    const attrs = await this.prisma.attribute.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        group: { slug: "scale", isActive: true },
      },
      select: { value: true, displayValue: true },
    });
    const scaleSet = new Set<string>();
    for (const a of attrs) {
      scaleSet.add(a.displayValue || a.value);
    }
    return Array.from(scaleSet).sort().slice(0, limit);
  }

  private async richAutocompleteMaterials(
    query: string,
    limit: number,
  ): Promise<Array<{ slug: string; label: string }>> {
    const ids = await fulltextAttributeSearch(this.prisma, query, 50);
    if (ids.length === 0) return [];

    const attrs = await this.prisma.attribute.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        group: { slug: "material", isActive: true },
      },
      select: { slug: true, value: true, displayValue: true },
    });
    const map = new Map<string, string>();
    for (const a of attrs) {
      map.set(a.slug, a.displayValue || a.value);
    }
    return Array.from(map.entries())
      .map(([slug, label]) => ({ slug, label }))
      .slice(0, limit);
  }

  private async richAutocompleteConditions(
    query: string,
    limit: number,
  ): Promise<Array<{ value: string; label: string }>> {
    const conditionLabels: Record<string, string> = {
      new: "Yeni",
      very_good: "Mükemmel",
      good: "İyi",
      fair: "Orta",
    };
    const list = Object.entries(conditionLabels).map(([value, label]) => ({
      value,
      label,
    }));
    const q = query.toLowerCase();
    return list
      .filter(
        (c) =>
          c.value.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q),
      )
      .slice(0, limit);
  }
}
