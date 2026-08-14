import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ActiveCampaignDto, DiscountResponseDto } from "./dto";
import { DiscountScope, DiscountType, DiscountTarget } from "@prisma/client";
import { isProductInDiscountScope } from "./helpers/discount-scope";
import { bestQuantityCampaignDiscount } from "./helpers/quantity-campaign";
import { toDiscountResponse } from "./helpers/discount-response.mapper";

/**
 * Kodsuz-otomatik kampanyaların ürüne yansıyan yüzü: vitrin fiyatı, sepette
 * satır bazlı adet kampanyası, ürün listesi filtresi ve kampanya vitrini.
 * DiscountService'ten birebir taşındı.
 *
 * Hepsi tek soruyu farklı yerlerde soruyor — "bu ürüne şu an hangi kampanya
 * uygulanır?". Ürün kartı, sepet ve kampanya sayfası aynı yanıtı vermezse
 * alıcı gördüğü fiyattan başkasını öder; bu yüzden dördü de aynı kapsam
 * yüklemini (`isProductInDiscountScope`) tek yerden okuyor.
 */
@Injectable()
export class DiscountPricingService {
  constructor(private readonly prisma: PrismaService) {}

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

    // KODSUZ ürün-fiyatı kampanyası artık TANIMLANAMAZ (satıcı kampanyası kod
    // ister; admin ürün fiyatına dokunamaz — cep kuralı). Vitrin fiyatını
    // düşüren tek mekanizma ürünün kendi indirimli satış fiyatıdır
    // (product-sale-window). Eski kodsuz kayıtlar bilinçli olarak YOK sayılır;
    // adet koşullu türler (bogo/bulk_quantity) ise birim vitrin fiyatını değil
    // sepetteki satır tutarını etkiler ve burada uygulanmaz.
    for (const item of items) {
      result.set(item.productId, null);
    }
    return result;
  }

  /**
   * Sepet satırları için adet koşullu SATICI kampanyalarını (bogo /
   * bulk_quantity) TEK sorguyla çözer. Satır bazlıdır (İ7): koşul o satırın
   * adediyle değerlendirilir; aynı satıra uyan kampanyalardan en yüksek
   * indirimi veren kazanır. Quote ve grup checkout AYNI metodu çağırır —
   * önizleme ile tahsilat ayrışamaz.
   */
  async quantityDiscountsForLines(
    lines: {
      productId: string;
      sellerId: string;
      categoryId: string | null;
      unitPrice: number;
      quantity: number;
    }[],
  ): Promise<
    Map<string, { discountId: string; name: string; amount: number }>
  > {
    const result = new Map<
      string,
      { discountId: string; name: string; amount: number }
    >();
    // İki türün de eşiği en az 2 adettir; tek adetlik satır sorguyu tetiklemez.
    const multi = lines.filter((line) => line.quantity >= 2);
    if (!multi.length) return result;

    const now = new Date();
    const sellerIds = [...new Set(multi.map((line) => line.sellerId))];
    const productIds = multi.map((line) => line.productId);
    const campaigns = await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null,
        target: DiscountTarget.product_price,
        type: { in: [DiscountType.bogo, DiscountType.bulk_quantity] },
        startDate: { lte: now },
        endDate: { gte: now },
        OR: [
          { scope: DiscountScope.seller, sellerId: { in: sellerIds } },
          {
            scope: DiscountScope.product,
            targetProductIds: { hasSome: productIds },
          },
        ],
      },
      orderBy: { priority: "asc" },
    });
    if (!campaigns.length) return result;

    for (const line of multi) {
      const eligible = campaigns.filter(
        (campaign) =>
          // Satıcı kampanyası yalnız KENDİ ürününe iner (cep kuralı).
          campaign.sellerId === line.sellerId &&
          isProductInDiscountScope(
            {
              id: line.productId,
              sellerId: line.sellerId,
              categoryId: line.categoryId ?? "",
            },
            campaign,
          ),
      );
      const winner = bestQuantityCampaignDiscount(
        eligible,
        line.unitPrice,
        line.quantity,
      );
      if (winner) {
        result.set(line.productId, {
          discountId: (winner.campaign as { id: string }).id,
          name: winner.campaign.name,
          amount: winner.amount,
        });
      }
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
        // YALNIZ ürün fiyatı kampanyaları: bedel kampanyası vitrin fiyatını
        // DÜŞÜRMEZ (komisyonu/kargoyu indirir) — buraya karışırsa etiket yalan söyler.
        target: DiscountTarget.product_price,
        // Kodsuz yüzde/sabit fiyat kampanyaları KALDIRILDI (eski kayıtlar yok
        // sayılır); "kampanyalı ürün" filtresi yalnız adet koşullu satıcı
        // kampanyalarını (bogo / bulk_quantity) tanır.
        type: { in: [DiscountType.bogo, DiscountType.bulk_quantity] },
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
        // YALNIZ ürün fiyatı kampanyaları: bedel kampanyası vitrin fiyatını
        // DÜŞÜRMEZ (komisyonu/kargoyu indirir) — buraya karışırsa etiket yalan söyler.
        target: DiscountTarget.product_price,
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
        applicableDiscounts.map((d) => toDiscountResponse(d)),
      );
    }

    return result;
  }
}
