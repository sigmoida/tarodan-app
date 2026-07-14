import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { DiscountService } from '../discount/discount.service';
import { StorageService } from '../storage/storage.service';
import { isPremiumEntitled } from '../membership/membership.util';
import { ProductStatus } from '@prisma/client';
import { getAvailableQuantity } from './helpers/product-availability.helper';

/**
 * ProductCommonService — ürün alt servislerinin paylaştığı yardımcılar (leaf; yalnız
 * altyapı enjekte eder, başka alt servise bağımlı değildir). formatProductResponse
 * (create/query/update yanıt DTO'su) ve linkProductAttributes (create+update ölçek/
 * malzeme/attribute bağlama) private->public'e çekildi; alt servisler bunlara
 * this.common.* ile erişir. resolveAvatarUrl/getAttributesAndDerived/
 * getAttributeValueByGroup yalnız formatProductResponse tarafından kullanıldığı için
 * common içinde private kalır.
 */
@Injectable()
export class ProductCommonService {
  private readonly logger = new Logger(ProductCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discountService: DiscountService,
    private readonly storageService: StorageService,
  ) { }

  /**
   * Format product response (tekil). N+1 giderme (#67): tekil = tek-elemanlı batch.
   * Batch fetch + yanıt kurma tek otoritede (formatProductResponseMany / buildProductResponse)
   * → liste ve tekil yol arasında şekil/değer drift'i imkânsız.
   */
  async formatProductResponse(product: any) {
    const [formatted] = await this.formatProductResponseMany([product]);
    return formatted;
  }

  /**
   * Format many products with BATCHED stats (#67). Eskiden her ürün için 4 per-seller
   * sorgu (product.count/order.count/rating.aggregate/userMembership) + 1 per-product
   * discount atılıyordu → 20'lik sayfa 80+ sorgu. Artık sayfa başına:
   *   - benzersiz sellerId'ler için 4 grouped sorgu (product/order/rating groupBy + membership findMany)
   *   - cached rating'i olmayan ürünler için 1 grouped productRating sorgusu
   *   - tüm ürünler için 1 toplu discount çözümü (DiscountService.getEffectiveDisplayPriceMany)
   * Değerler ve yanıt şekli birebir korunur (buildProductResponse aynı çıktıyı üretir).
   */
  async formatProductResponseMany(products: any[]): Promise<any[]> {
    if (!products?.length) return [];

    // ── 1) Satıcı istatistikleri (per-seller, grouped) ──────────────────────
    const sellerIds = [
      ...new Set(products.map((p) => p.seller?.id).filter(Boolean) as string[]),
    ];
    const sellerStats = new Map<
      string,
      {
        listingsCount: number;
        totalSales: number;
        rating: number | null;
        totalRatings: number;
        isPremium: boolean;
      }
    >();
    if (sellerIds.length) {
      const [listings, sales, ratings, memberships] = await Promise.all([
        this.prisma.product.groupBy({
          by: ['sellerId'],
          where: { sellerId: { in: sellerIds }, status: ProductStatus.active },
          _count: true,
        }),
        this.prisma.order.groupBy({
          by: ['sellerId'],
          where: { sellerId: { in: sellerIds }, status: 'completed' },
          _count: true,
        }),
        this.prisma.rating.groupBy({
          by: ['receiverId'],
          where: { receiverId: { in: sellerIds }, status: 'approved' },
          _avg: { score: true },
          _count: true,
        }),
        this.prisma.userMembership.findMany({
          where: { userId: { in: sellerIds } },
          select: {
            userId: true,
            status: true,
            currentPeriodEnd: true,
            tier: { select: { type: true } },
          },
        }),
      ]);
      const listingsMap = new Map(listings.map((r) => [r.sellerId, r._count]));
      const salesMap = new Map(sales.map((r) => [r.sellerId, r._count]));
      const ratingMap = new Map(ratings.map((r) => [r.receiverId, r]));
      const membershipMap = new Map(memberships.map((m) => [m.userId, m]));
      for (const sid of sellerIds) {
        const rat = ratingMap.get(sid);
        const hasRating = !!(rat && rat._count > 0 && rat._avg?.score);
        sellerStats.set(sid, {
          listingsCount: listingsMap.get(sid) ?? 0,
          totalSales: salesMap.get(sid) ?? 0,
          rating: hasRating ? Number(rat!._avg!.score!.toFixed(1)) : null,
          totalRatings: hasRating ? rat!._count : 0,
          isPremium: isPremiumEntitled(membershipMap.get(sid) ?? null),
        });
      }
    }

    // ── 2) Ürün puanı (cached kolon yoksa grouped aggregate) ────────────────
    const needRatingAgg = products
      .filter((p) => !(p.averageRating != null && p.ratingCount != null))
      .map((p) => p.id);
    const productRatings = new Map<
      string,
      { average: number | null; count: number }
    >();
    if (needRatingAgg.length) {
      const rows = await this.prisma.productRating.groupBy({
        by: ['productId'],
        where: { productId: { in: needRatingAgg }, status: 'approved' },
        _avg: { score: true },
        _count: true,
      });
      for (const r of rows) {
        productRatings.set(r.productId, {
          average: r._avg?.score ? Number(r._avg.score.toFixed(1)) : null,
          count: r._count || 0,
        });
      }
    }

    // ── 3) Kampanya indirimleri (tek toplu çözüm) ───────────────────────────
    const discountItems = products
      .map((p) => {
        const sellerId = p.sellerId ?? p.seller?.id;
        const categoryId = p.categoryId ?? p.category?.id;
        if (!sellerId || !categoryId) return null;
        return {
          productId: p.id,
          sellerId,
          categoryId,
          currentDisplayPrice: Number(p.price),
        };
      })
      .filter(Boolean) as {
      productId: string;
      sellerId: string;
      categoryId: string;
      currentDisplayPrice: number;
    }[];
    const discountPrices = await this.discountService.getEffectiveDisplayPriceMany(
      discountItems,
    );

    const pre = { sellerStats, productRatings, discountPrices };
    return Promise.all(products.map((p) => this.buildProductResponse(p, pre)));
  }

  /**
   * Saf yanıt kurucu: TÜM istatistikler önceden hesaplanmış (pre) map'lerden gelir;
   * burada HİÇBİR DB sorgusu yoktur (yalnız avatar presign — DB değil). Eski
   * formatProductResponse'un çıktısını birebir üretir.
   */
  private async buildProductResponse(
    product: any,
    pre: {
      sellerStats: Map<
        string,
        {
          listingsCount: number;
          totalSales: number;
          rating: number | null;
          totalRatings: number;
          isPremium: boolean;
        }
      >;
      productRatings: Map<string, { average: number | null; count: number }>;
      discountPrices: Map<string, number | null>;
    },
  ) {
    const s = product.seller?.id ? pre.sellerStats.get(product.seller.id) : undefined;
    const sellerListingsCount = s?.listingsCount ?? 0;
    const sellerTotalSales = s?.totalSales ?? 0;
    const sellerRating = s?.rating ?? null;
    const sellerTotalRatings = s?.totalRatings ?? 0;
    const sellerIsPremium = s?.isPremium ?? false;

    // Get product rating stats (use cached columns when available, else precomputed aggregate)
    let ratingAverage: number | null = null;
    let ratingCount = 0;
    if (product.averageRating != null && product.ratingCount != null) {
      ratingAverage = Number(product.averageRating.toFixed(1));
      ratingCount = product.ratingCount;
    } else {
      const pr = pre.productRatings.get(product.id);
      ratingAverage = pr?.average ?? null;
      ratingCount = pr?.count ?? 0;
    }

    // A + oldPrice: price (A) = her zaman güncel satış fiyatı; oldPrice = indirim öncesi (çizili)
    const now = new Date();
    const priceA = Number(product.price);
    const oldPriceDb = product.oldPrice != null ? Number(product.oldPrice) : null;
    const saleStartDate = product.saleStartDate ? new Date(product.saleStartDate) : null;
    const saleEndDate = product.saleEndDate ? new Date(product.saleEndDate) : null;
    const saleDatesValid =
      (saleStartDate == null || now >= saleStartDate) &&
      (saleEndDate == null || now <= saleEndDate);
    const isProductSale = oldPriceDb != null && saleDatesValid;

    // Kampanya indirimi (satıcı/ürün/kategori/global): ürün kartında gösterilecek fiyata yansıt
    const sellerId = product.sellerId ?? product.seller?.id;
    const categoryId = product.categoryId ?? product.category?.id;
    let displayPrice = priceA;
    let displayOldPrice: number | null = isProductSale ? oldPriceDb : null;
    let discountPercent: number | null = isProductSale && oldPriceDb && oldPriceDb > priceA
      ? Math.round(((oldPriceDb - priceA) / oldPriceDb) * 100)
      : null;

    if (sellerId && categoryId) {
      const campaignPrice = pre.discountPrices.get(product.id) ?? null;
      if (campaignPrice != null && campaignPrice < priceA) {
        displayPrice = campaignPrice;
        displayOldPrice = priceA;
        discountPercent = Math.round(((priceA - campaignPrice) / priceA) * 100);
      }
    }

    const isOnSale = displayOldPrice != null && displayOldPrice > displayPrice;

    // Boost (öne çıkarma) durumu: boostedUntil gelecekteyse ilan sponsorludur
    const boostedUntil = product.boostedUntil ? new Date(product.boostedUntil) : null;
    const isBoosted = boostedUntil != null && boostedUntil > now;

    return {
      id: product.id,
      sellerId, // flat sellerId (nested seller.id'ye ek) — API tüketicileri için
      title: product.title,
      description: product.description,
      price: displayPrice,
      oldPrice: displayOldPrice,
      saleStartDate: saleStartDate?.toISOString() || null,
      saleEndDate: saleEndDate?.toISOString() || null,
      isOnSale,
      discountPercent,
      isBoosted,
      boostedUntil: boostedUntil?.toISOString() || null,
      // API uyumluluğu: eski alanlar (originalPrice/salePrice) = oldPrice/price
      originalPrice: displayOldPrice,
      salePrice: displayPrice,
      condition: product.condition,
      status: product.status,
      isTradeEnabled: product.isTradeEnabled || false,
      viewCount: product.viewCount || 0,
      likeCount: product.likeCount || 0,
      quantity: product.quantity !== null && product.quantity !== undefined ? Number(product.quantity) : null,
      availableQuantity: getAvailableQuantity(product) ?? undefined, // müsait adet = quantity; null = sınırsız stok
      images: (product.images || []).map((img: { id: string; cardKey: string; detailKey: string; sortOrder: number }) => ({
        id: img.id,
        cardKey: img.cardKey,
        detailKey: img.detailKey,
        cardUrl: this.storageService.getPublicAssetUrl(img.cardKey),
        detailUrl: this.storageService.getPublicAssetUrl(img.detailKey),
        sortOrder: img.sortOrder,
      })),
      rating: {
        average: ratingAverage,
        count: ratingCount,
      },
      seller: product.seller
        ? {
          id: product.seller.id,
          displayName: product.seller.displayName,
          isVerified: product.seller.isVerified,
          sellerType: product.seller.sellerType,
          avatarUrl: await this.resolveAvatarUrl((product.seller as any).avatarUrl),
          listings_count: sellerListingsCount,
          productsCount: sellerListingsCount,
          totalSales: sellerTotalSales,
          rating: sellerRating,
          totalRatings: sellerTotalRatings,
          isPremium: sellerIsPremium,
        }
        : undefined,
      category: product.category
        ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
        : undefined,
      brand: product.brand
        ? {
          id: product.brand.id,
          name: product.brand.name,
          slug: product.brand.slug,
        }
        : undefined,
      manufacturer: product.manufacturer
        ? {
          id: product.manufacturer.id,
          name: product.manufacturer.name,
          slug: product.manufacturer.slug,
        }
        : undefined,
      carModel: product.carModel
        ? {
          id: product.carModel.id,
          name: product.carModel.name,
          slug: product.carModel.slug,
          brandSlug: product.carModel.brand?.slug,
        }
        : undefined,
      ...(this.getAttributesAndDerived(product.productAttributes)),
      year: product.releaseDate ? new Date(product.releaseDate).getFullYear() : undefined,
      isPreorder: product.isPreorder || false,
      releaseDate: product.releaseDate,
      isLimited: product.isLimited || false,
      editionNumber: product.editionNumber,
      editionTotal: product.editionTotal,
      isSet: product.isSet || false,
      bundleSize: product.bundleSize,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private async resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl('avatars', avatarUrl, 86400);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Build attributes array and derived scale/material without throwing (defensive for list/detail).
   */
  private getAttributesAndDerived(productAttributes: any[] | undefined): {
    attributes: any[];
    scale: string | undefined;
    material: string | undefined;
  } {
    try {
      const attributes = (productAttributes ?? [])
        .filter((pa: any) => pa?.attribute?.group)
        .map((pa: any) => ({
          id: pa.attribute.id,
          name: pa.attribute.slug,
          slug: pa.attribute.slug,
          label: pa.attribute.group.name,
          value: pa.attribute.displayValue || pa.attribute.value,
          group: pa.attribute.group.name,
          groupSlug: pa.attribute.group.slug,
          manufacturerSlug: pa.attribute.group.manufacturerSlug ?? null,
        }));
      const scaleFromGroup = this.getAttributeValueByGroup(productAttributes, 'scale', 'Ölçek');
      const scaleFromAttrs = attributes.find((a) => a.group === 'Ölçek' || a.label === 'Ölçek')?.value;
      return {
        attributes,
        scale: scaleFromGroup || scaleFromAttrs,
        material: this.getAttributeValueByGroup(productAttributes, 'material', 'Malzeme'),
      };
    } catch (e) {
      this.logger.warn('getAttributesAndDerived failed', e);
      return { attributes: [], scale: undefined, material: undefined };
    }
  }

  /**
   * Get attribute display value by group slug (e.g. 'scale' -> '1/64', 'material' -> 'Diecast (Metal)')
   * Also matches by group name for robustness (e.g. 'Ölçek' for scale).
   */
  private getAttributeValueByGroup(productAttributes: any[] | undefined, groupSlug: string, groupNameFallback?: string): string | undefined {
    if (!productAttributes?.length) return undefined;
    const pa = productAttributes.find(
      (p: any) =>
        p.attribute?.group?.slug === groupSlug ||
        (groupNameFallback && p.attribute?.group?.name?.toLowerCase() === groupNameFallback.toLowerCase()),
    );
    // Use || (not ??) so that empty-string displayValue correctly falls through to value.
    const val = pa?.attribute?.displayValue || pa?.attribute?.value || undefined;
    if (val) return val;
    // Normalize scale slug to value format for dropdown match (e.g. "164" -> "1:64", "118" -> "1:18").
    // Only runs when both displayValue and value are falsy (null/undefined/empty).
    if (groupSlug === 'scale' && pa?.attribute?.slug && /^\d+$/.test(pa.attribute.slug)) {
      const s = pa.attribute.slug;
      if (s.length >= 2) return `1:${s.slice(1)}`;
      if (s.length === 1) return `1:${s}`;
    }
    return undefined;
  }

  /**
   * Link scale (1:64), material (slug), attributeIds, and attribute slugs to product via ProductAttribute.
   * attributeSlugs: opaque list of Attribute.slug values from any group (used for Hot Wheels extras
   * like 'mainline', 'treasure-hunt', 'red'). Slugs are resolved server-side to attribute IDs.
   * Unknown slugs are silently dropped (logged in dev).
   */
  async linkProductAttributes(
    productId: string,
    scale?: string,
    attributeIds?: string[],
    materialSlug?: string,
    attributeSlugs?: string[],
  ) {
    const toLink: string[] = [];

    if (scale?.trim()) {
      const scaleTrim = scale.trim();
      const scaleNorm = scaleTrim.replace(/\s/g, '').replace(/[:\/]/g, ''); // "1:64" or "1/64" -> "164"
      const scaleSlugAlt = scaleTrim.replace(':', '-'); // "1:64" -> "1-64" (seed format)
      const scaleAttr = await this.prisma.attribute.findFirst({
        where: {
          group: { slug: 'scale', isActive: true },
          isActive: true,
          OR: [
            { slug: scaleNorm },
            { slug: scaleSlugAlt },
            { value: scaleTrim },
            { displayValue: scaleTrim },
          ],
        },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });
      if (scaleAttr) toLink.push(scaleAttr.id);
    }
    if (materialSlug?.trim()) {
      const materialAttr = await this.prisma.attribute.findFirst({
        where: { group: { slug: 'material' }, slug: materialSlug.trim(), isActive: true },
        select: { id: true },
      });
      if (materialAttr) toLink.push(materialAttr.id);
    }
    if (attributeIds?.length) toLink.push(...attributeIds);

    if (attributeSlugs?.length) {
      // Resolve slug -> attribute id. Slugs are unique within a group; the same slug could
      // theoretically exist under multiple groups, so we accept all matches.
      const resolved = await this.prisma.attribute.findMany({
        where: {
          slug: { in: attributeSlugs.map((s) => s.trim()).filter(Boolean) },
          isActive: true,
          group: { isActive: true },
        },
        select: { id: true, slug: true },
      });
      const resolvedSlugs = new Set(resolved.map((r) => r.slug));
      const unknown = attributeSlugs.filter((s) => !resolvedSlugs.has(s));
      if (unknown.length > 0 && process.env.NODE_ENV === 'development') {
        this.logger.warn(
          `Unknown attribute slug(s) ignored for product ${productId}: ${unknown.join(', ')}`,
        );
      }
      toLink.push(...resolved.map((r) => r.id));
    }

    for (const attributeId of toLink) {
      await this.prisma.productAttribute.upsert({
        where: { productId_attributeId: { productId, attributeId } },
        create: { productId, attributeId },
        update: {},
      });
    }
  }
}
