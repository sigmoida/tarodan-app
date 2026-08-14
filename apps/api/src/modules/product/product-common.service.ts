import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { DiscountService } from "../discount/discount.service";
import { FeeDiscountResolver } from "../discount/fee-discount.resolver";
import { StorageService } from "../storage/storage.service";
import {
  canTradeFromMembership,
  isPremiumEntitled,
} from "../membership/membership.util";
import { getFreeTierCanTrade } from "../membership/free-tier-trade.helper";
import { ProductStatus } from "@prisma/client";
import { publicIdentityFields } from "../../common/helpers/public-identity";
import { getAvailableQuantity } from "./helpers/product-availability.helper";
import { resolveSalePrice } from "./helpers/product-sale-window";
import {
  publicProductRatingWhere,
  publicUserRatingWhere,
} from "../../common/helpers/public-rating";
import {
  SCALE_GROUP_SLUG,
  MATERIAL_GROUP_SLUG,
  COLOR_GROUP_SLUG,
} from "../../common/helpers/attribute-groups";

/** Bir ilanın seçtiği tüm katalog değerleri (ölçek/malzeme/renk/serbest slug). */
export interface ProductAttributeSelection {
  scale?: string;
  material?: string;
  /** Global "color" grubundaki attribute slug'ları. */
  colors?: string[];
  attributeIds?: string[];
  attributeSlugs?: string[];
}

export interface ResolvedProductAttributes {
  /** Bağlanacak Attribute id'leri (tekrarsız). */
  ids: string[];
  /** Bağlanan renklerin görünen adları — `products.color` kolonu için. */
  colorLabels: string[];
}

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
    @Optional()
    private readonly feeDiscounts?: FeeDiscountResolver,
  ) {}

  /**
   * Ürün görselinin herkese açık URL'i. Depolama erişimi bu serviste toplanır;
   * çağıranlar StorageService'e ayrıca bağlanmasın diye dışa açılır.
   */
  publicAssetUrl(key: string): string {
    return this.storageService.getPublicAssetUrl(key);
  }

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
        canTrade: boolean;
      }
    >();
    const freeTierCanTrade = sellerIds.length
      ? await getFreeTierCanTrade(this.prisma)
      : false;
    if (sellerIds.length) {
      const [listings, sales, ratings, memberships] = await Promise.all([
        this.prisma.product.groupBy({
          by: ["sellerId"],
          where: { sellerId: { in: sellerIds }, status: ProductStatus.active },
          _count: true,
        }),
        this.prisma.order.groupBy({
          by: ["sellerId"],
          where: { sellerId: { in: sellerIds }, status: "completed" },
          _count: true,
        }),
        this.prisma.rating.groupBy({
          by: ["receiverId"],
          where: publicUserRatingWhere({ receiverId: { in: sellerIds } }),
          _avg: { score: true },
          _count: true,
        }),
        this.prisma.userMembership.findMany({
          where: { userId: { in: sellerIds } },
          select: {
            userId: true,
            status: true,
            currentPeriodEnd: true,
            tier: { select: { type: true, isActive: true, canTrade: true } },
            user: {
              select: {
                businessStatus: true,
                companyName: true,
                taxId: true,
              },
            },
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
          isPremium: isPremiumEntitled(
            membershipMap.get(sid) ?? null,
            membershipMap.get(sid)?.user,
          ),
          // Takas ÜCRETLİ bir üyelik özelliği; ürünün bayrağı yalnız niyettir.
          canTrade: canTradeFromMembership(
            membershipMap.get(sid) ?? null,
            membershipMap.get(sid)?.user,
            freeTierCanTrade,
          ),
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
        by: ["productId"],
        where: publicProductRatingWhere({ productId: { in: needRatingAgg } }),
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
          // Kampanya, indirim penceresi UYGULANMIŞ fiyatın üstüne biner.
          currentDisplayPrice: resolveSalePrice(p).price,
        };
      })
      .filter(Boolean) as {
      productId: string;
      sellerId: string;
      categoryId: string;
      currentDisplayPrice: number;
    }[];
    const discountPrices =
      await this.discountService.getEffectiveDisplayPriceMany(discountItems);

    // Bedel kampanyaları vitrin FİYATINI değiştirmez (komisyonu/kargoyu indirir),
    // bu yüzden ancak bir rozetle görünür olabilirler. Vitrin herkese açıktır:
    // yalnız kimlik gerektirmeyen (herkese/tüm alıcılara açık) kampanyalar
    // duyurulur — üyeliğe özel bir avantajı herkese vaat etmiş olmayız.
    const feeCampaigns = (await this.feeDiscounts?.loadActive()) ?? [];
    const feeCampaignLabels = new Map<string, string[]>();
    for (const item of discountItems) {
      const matched = (
        this.feeDiscounts?.selectFor(feeCampaigns as any, {
          productId: item.productId,
          categoryId: item.categoryId,
          sellerId: item.sellerId,
          buyerId: null,
          buyerTier: null,
        }) ?? []
      )
        .filter((candidate) => candidate.target.startsWith("buyer_"))
        .map((candidate) => candidate.name);
      if (matched.length) feeCampaignLabels.set(item.productId, matched);
    }

    const pre = {
      sellerStats,
      productRatings,
      discountPrices,
      feeCampaignLabels,
    };
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
          canTrade: boolean;
        }
      >;
      productRatings: Map<string, { average: number | null; count: number }>;
      discountPrices: Map<string, number | null>;
      /** Vitrinde rozet olarak gösterilecek bedel kampanyaları (ürün başına). */
      feeCampaignLabels?: Map<string, string[]>;
    },
  ) {
    const s = product.seller?.id
      ? pre.sellerStats.get(product.seller.id)
      : undefined;
    const sellerListingsCount = s?.listingsCount ?? 0;
    const sellerTotalSales = s?.totalSales ?? 0;
    const sellerRating = s?.rating ?? null;
    const sellerTotalRatings = s?.totalRatings ?? 0;
    const sellerIsPremium = s?.isPremium ?? false;
    const sellerCanTrade = s?.canTrade ?? false;

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

    // İndirim penceresi ORTAK kuraldan (`resolveSalePrice`): pencere dışındaysa
    // satış fiyatı indirim ÖNCESİ fiyattır. Eskiden burada yalnız çizili fiyat
    // düşürülüyordu — vitrin indirimsiz görünürken tahsilat indirimli kalıyordu.
    const now = new Date();
    const sale = resolveSalePrice(product, now);
    const priceA = sale.price;
    const saleStartDate = product.saleStartDate
      ? new Date(product.saleStartDate)
      : null;
    const saleEndDate = product.saleEndDate
      ? new Date(product.saleEndDate)
      : null;

    // Kampanya indirimi (satıcı/ürün/kategori/global): ürün kartında gösterilecek fiyata yansıt
    const sellerId = product.sellerId ?? product.seller?.id;
    const categoryId = product.categoryId ?? product.category?.id;
    let displayPrice = priceA;
    let displayOldPrice: number | null = sale.oldPrice;
    let discountPercent: number | null =
      sale.isOnSale && sale.oldPrice
        ? Math.round(((sale.oldPrice - priceA) / sale.oldPrice) * 100)
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
    const boostedUntil = product.boostedUntil
      ? new Date(product.boostedUntil)
      : null;
    const isBoosted = boostedUntil != null && boostedUntil > now;

    return {
      id: product.id,
      productCode: product.productCode,
      // Bedel kampanyaları fiyatı değiştirmediği için rozetle duyurulur
      // ("Komisyonsuz alışveriş"); boşsa alan hiç gönderilmez.
      feeCampaigns: pre.feeCampaignLabels?.get(product.id) ?? undefined,
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
      modelCode: product.modelCode,
      color: product.color,
      isBoxed: product.isBoxed,
      status: product.status,
      // Moderasyon reddi gerekçesi — yalnız satıcının kendi listesinde anlamlı;
      // public detay rejected ürünü zaten 404'ler, sızıntı riski yok.
      rejectionReason: product.rejectionReason ?? null,
      isTradeEnabled: product.isTradeEnabled || false,
      // Satıcının NİYETİ (isTradeEnabled) ile GERÇEKTEN takas edilebilirliği
      // ayrı alanlardır: üyelik bitince yetki düşer, bayrak üründe kalır.
      // Rozet/buton bu alanı kullanır; bayrak sahibinin düzenleme formuna aittir.
      tradeAvailable: (product.isTradeEnabled || false) && sellerCanTrade,
      viewCount: product.viewCount || 0,
      likeCount: product.likeCount || 0,
      quantity:
        product.quantity !== null && product.quantity !== undefined
          ? Number(product.quantity)
          : null,
      availableQuantity: getAvailableQuantity(product) ?? undefined, // müsait adet = quantity; null = sınırsız stok
      images: (product.images || []).map(
        (img: {
          id: string;
          cardKey: string;
          detailKey: string;
          sortOrder: number;
        }) => ({
          id: img.id,
          cardKey: img.cardKey,
          detailKey: img.detailKey,
          cardUrl: this.storageService.getPublicAssetUrl(img.cardKey),
          detailUrl: this.storageService.getPublicAssetUrl(img.detailKey),
          sortOrder: img.sortOrder,
        }),
      ),
      rating: {
        average: ratingAverage,
        count: ratingCount,
      },
      // Satıcı kartı herkese açıktır: ad tek zincirden gelir (firma → username
      // → isim), gerçek ad yüke hiç girmez.
      seller: product.seller
        ? {
            id: product.seller.id,
            ...publicIdentityFields(product.seller),
            isVerified: product.seller.isVerified,
            sellerType: product.seller.sellerType,
            avatarUrl: await this.resolveAvatarUrl(
              (product.seller as any).avatarUrl,
            ),
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
      ...this.getAttributesAndDerived(product.productAttributes),
      year: product.releaseDate
        ? new Date(product.releaseDate).getFullYear()
        : undefined,
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

  private async resolveAvatarUrl(
    avatarUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl(
          "avatars",
          avatarUrl,
          86400,
        );
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
      const scaleFromGroup = this.getAttributeValueByGroup(
        productAttributes,
        SCALE_GROUP_SLUG,
        "Ölçek",
      );
      const scaleFromAttrs = attributes.find(
        (a) => a.group === "Ölçek" || a.label === "Ölçek",
      )?.value;
      return {
        attributes,
        scale: scaleFromGroup || scaleFromAttrs,
        material: this.getAttributeValueByGroup(
          productAttributes,
          MATERIAL_GROUP_SLUG,
          "Malzeme",
        ),
      };
    } catch (e) {
      this.logger.warn("getAttributesAndDerived failed", e);
      return { attributes: [], scale: undefined, material: undefined };
    }
  }

  /**
   * Get attribute display value by group slug (e.g. 'scale' -> '1/64', 'material' -> 'Diecast (Metal)')
   * Also matches by group name for robustness (e.g. 'Ölçek' for scale).
   */
  private getAttributeValueByGroup(
    productAttributes: any[] | undefined,
    groupSlug: string,
    groupNameFallback?: string,
  ): string | undefined {
    if (!productAttributes?.length) return undefined;
    const pa = productAttributes.find(
      (p: any) =>
        p.attribute?.group?.slug === groupSlug ||
        (groupNameFallback &&
          p.attribute?.group?.name?.toLowerCase() ===
            groupNameFallback.toLowerCase()),
    );
    // Use || (not ??) so that empty-string displayValue correctly falls through to value.
    const val =
      pa?.attribute?.displayValue || pa?.attribute?.value || undefined;
    if (val) return val;
    // Normalize scale slug to value format for dropdown match (e.g. "164" -> "1:64", "118" -> "1:18").
    // Only runs when both displayValue and value are falsy (null/undefined/empty).
    if (
      groupSlug === SCALE_GROUP_SLUG &&
      pa?.attribute?.slug &&
      /^\d+$/.test(pa.attribute.slug)
    ) {
      const s = pa.attribute.slug;
      if (s.length >= 2) return `1:${s.slice(1)}`;
      if (s.length === 1) return `1:${s}`;
    }
    return undefined;
  }

  /**
   * Resolve every product attribute through the same canonical lookup used by
   * both regular listing creation and admin bulk import.
   *
   * Renkler ayrı dönülür: `products.color` kolonu görünen adları denormalize
   * tutuyor (arama metni ve eski ekranlar oradan besleniyor), bu yüzden çağıran
   * taraf bağladığı renklerin etiketine ihtiyaç duyar.
   */
  async resolveProductAttributes(
    selection: ProductAttributeSelection,
    options: { rejectUnknown?: boolean } = {},
  ): Promise<ResolvedProductAttributes> {
    const {
      scale,
      material: materialSlug,
      colors,
      attributeIds,
      attributeSlugs,
    } = selection;
    const toLink: string[] = [];
    const colorLabels: string[] = [];
    const unknown: string[] = [];

    if (scale?.trim()) {
      const scaleTrim = scale.trim();
      const scaleNorm = scaleTrim.replace(/\s/g, "").replace(/[:\/]/g, "");
      const scaleSlugAlt = scaleTrim.replace(":", "-");
      const scaleAttr = await this.prisma.attribute.findFirst({
        where: {
          group: { slug: SCALE_GROUP_SLUG, isActive: true },
          isActive: true,
          OR: [
            { slug: { equals: scaleNorm, mode: "insensitive" } },
            { slug: { equals: scaleSlugAlt, mode: "insensitive" } },
            { value: { equals: scaleTrim, mode: "insensitive" } },
            { displayValue: { equals: scaleTrim, mode: "insensitive" } },
          ],
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });
      if (scaleAttr) toLink.push(scaleAttr.id);
      else unknown.push(`ölçek '${scaleTrim}'`);
    }

    if (materialSlug?.trim()) {
      const material = materialSlug.trim();
      const materialAttr = await this.prisma.attribute.findFirst({
        where: {
          group: { slug: MATERIAL_GROUP_SLUG, isActive: true },
          isActive: true,
          OR: [
            { slug: { equals: material, mode: "insensitive" } },
            { value: { equals: material, mode: "insensitive" } },
            { displayValue: { equals: material, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (materialAttr) toLink.push(materialAttr.id);
      else unknown.push(`malzeme '${material}'`);
    }

    // Renk sessizce düşürülmez: satıcı seçtiği rengin kaybolduğunu ancak ilan
    // yayımlandıktan sonra görürdü. Bilinmeyen slug doğrudan 400 döner.
    const requestedColors = colors?.map((slug) => slug.trim()).filter(Boolean);
    if (requestedColors?.length) {
      const resolved = await this.prisma.attribute.findMany({
        where: {
          isActive: true,
          group: { slug: COLOR_GROUP_SLUG, isActive: true },
          OR: requestedColors.map((slug) => ({
            slug: { equals: slug, mode: "insensitive" as const },
          })),
        },
        select: { id: true, slug: true, value: true, displayValue: true },
      });
      const bySlug = new Map(
        resolved.map((item) => [item.slug.toLocaleLowerCase("tr-TR"), item]),
      );
      const missing: string[] = [];
      for (const slug of requestedColors) {
        const match = bySlug.get(slug.toLocaleLowerCase("tr-TR"));
        if (!match) {
          missing.push(slug);
          continue;
        }
        if (toLink.includes(match.id)) continue;
        toLink.push(match.id);
        colorLabels.push(match.displayValue || match.value);
      }
      if (missing.length) {
        throw new BadRequestException(
          `Geçersiz renk seçimi: ${missing.join(", ")}`,
        );
      }
    }

    if (attributeIds?.length) toLink.push(...attributeIds);

    const requestedSlugs =
      attributeSlugs?.map((slug) => slug.trim()).filter(Boolean) ?? [];
    if (requestedSlugs.length) {
      const resolved = await this.prisma.attribute.findMany({
        where: {
          OR: requestedSlugs.map((slug) => ({
            slug: { equals: slug, mode: "insensitive" as const },
          })),
          isActive: true,
          group: { isActive: true },
        },
        select: { id: true, slug: true },
      });
      const resolvedSlugs = new Set(
        resolved.map((item) => item.slug.toLocaleLowerCase("tr-TR")),
      );
      unknown.push(
        ...requestedSlugs
          .filter((slug) => !resolvedSlugs.has(slug.toLocaleLowerCase("tr-TR")))
          .map((slug) => `özellik '${slug}'`),
      );
      toLink.push(...resolved.map((item) => item.id));
    }

    if (unknown.length && options.rejectUnknown) {
      throw new Error(`aktif katalogda bulunamadı: ${unknown.join(", ")}`);
    }
    if (unknown.length && process.env.NODE_ENV === "development") {
      this.logger.warn(
        `Unknown product attribute(s) ignored: ${unknown.join(", ")}`,
      );
    }

    return { ids: [...new Set(toLink)], colorLabels };
  }

  /**
   * Link scale (1:64), material (slug), colors, attributeIds, and attribute slugs
   * to product via ProductAttribute.
   * attributeSlugs: opaque list of Attribute.slug values from any group (used for Hot Wheels extras
   * like 'mainline', 'treasure-hunt', 'red'). Slugs are resolved server-side to attribute IDs.
   * Unknown slugs are silently dropped (logged in dev) — renk bunun istisnasıdır.
   */
  async linkProductAttributes(
    productId: string,
    selection: ProductAttributeSelection,
  ): Promise<ResolvedProductAttributes> {
    const resolved = await this.resolveProductAttributes(selection);
    await this.attachProductAttributes(productId, resolved.ids);
    return resolved;
  }

  /** Çözülmüş attribute id'lerini ürüne bağlar (tekrar bağlamak zararsızdır). */
  async attachProductAttributes(productId: string, attributeIds: string[]) {
    for (const attributeId of attributeIds) {
      await this.prisma.productAttribute.upsert({
        where: { productId_attributeId: { productId, attributeId } },
        create: { productId, attributeId },
        update: {},
      });
    }
  }
}
