import { Injectable } from "@nestjs/common";
import { DiscountScope, DiscountType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { activeAutomaticCampaignWhere } from "./discount-predicates";
import {
  resolveSalePrice,
  type ProductSaleWindow,
} from "../product/helpers/product-sale-window";
import {
  DiscountScopeService,
  type CategoryAncestors,
} from "./discount-scope.service";

/**
 * Bir ürünün o anda geçerli BİRİM fiyatının tek kaynağı.
 *
 * İki katman sırayla uygulanır:
 *   1. ürünün KENDİ indirimi (`price` / `oldPrice` + tarih penceresi)
 *   2. otomatik kampanya (`Discount`, `code = null`) — uygun olanlar içinden
 *      alıcı lehine EN İYİSİ; kampanyalar birbirinin üstüne binmez.
 *
 * Bu iki adım daha önce beş ayrı yerde (vitrin, sepet, istek listesi, checkout
 * önizlemesi, üç checkout yolu) kısmen tekrarlanıyordu ve kopyalar ayrışmıştı:
 * sepet indirim penceresini hiç uygulamıyor, kupon doğrulaması kampanyayı
 * uyguluyor ama sepet uygulamıyordu. Sonuç, alıcının sepette gördüğü tutarla
 * tahsil edilenin ayrışmasıydı.
 */

export interface PriceableProduct extends ProductSaleWindow {
  id: string;
  sellerId: string;
  categoryId: string | null;
}

export interface CampaignMatch {
  discountId: string;
  name: string;
  /** Kampanyanın BİRİM başına indirdiği tutar. */
  discountPerUnit: number;
}

export interface ResolvedUnitPrice {
  productId: string;
  /** İndirim öncesi (çizili gösterilecek) birim fiyat. */
  originalUnitPrice: number;
  /** Yalnız ürünün kendi indirimi uygulanmış birim fiyat. */
  saleUnitPrice: number;
  /** Kampanya da uygulanmış birim fiyat — tahsilatın birim tabanı. */
  unitPrice: number;
  /** Ürünün KENDİ indirimi yürürlükte mi (kampanya bunu değiştirmez). */
  isOnSale: boolean;
  campaign: CampaignMatch | null;
}

export interface PriceableEntry {
  product: PriceableProduct;
  /** Verilmezse 1 — vitrin/liste gibi adetsiz bağlamlar için. */
  quantity?: number;
}

export interface ResolveUnitPriceOptions {
  now?: Date;
  /**
   * Kampanyanın `minCartValue` eşiği HANGİ tutarla karşılaştırılsın?
   *
   *  - `"line"` (varsayılan): her satır kendi tutarıyla. Vitrin, liste, istek
   *    listesi gibi sepet OLMAYAN bağlamlar içindir — liste sayfasındaki 24
   *    ürünün toplamı yanlışlıkla "sepet tutarı" sayılmasın.
   *  - `"cart"`: verilen satırların kampanya ÖNCESİ toplamı. Sepet ve checkout
   *    bunu kullanır; üç checkout yolu ile sepet aynı tabanı görsün diye tek
   *    seçenek olarak durur.
   */
  minCartValueBasis?: "line" | "cart";
}

/** Kampanya eşleşmesi için gereken minimum indirim alanları. */
type CampaignRow = {
  id: string;
  name: string;
  type: DiscountType;
  value: unknown;
  scope: DiscountScope;
  sellerId: string | null;
  categoryId: string | null;
  targetProductIds: string[];
  minCartValue: unknown;
  maxDiscountAmount: unknown;
};

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class ProductPriceResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: DiscountScopeService,
  ) {}

  /**
   * Tek ürün = tek elemanlı toplu çözüm. Matematik ve DB filtresi tek
   * otoritede kalsın diye ayrı bir yol yazılmaz.
   */
  async resolveOne(
    product: PriceableProduct,
    options: ResolveUnitPriceOptions = {},
  ): Promise<ResolvedUnitPrice> {
    const resolved = await this.resolveMany([{ product }], options);
    return resolved.get(product.id) as ResolvedUnitPrice;
  }

  async resolveMany(
    entries: PriceableEntry[],
    options: ResolveUnitPriceOptions = {},
  ): Promise<Map<string, ResolvedUnitPrice>> {
    const result = new Map<string, ResolvedUnitPrice>();
    if (!entries.length) return result;

    const now = options.now ?? new Date();

    // 1. Ürünün kendi indirimi — pencere dışındaysa indirim ÖNCESİ fiyat.
    const priced = entries.map((entry) => {
      const sale = resolveSalePrice(entry.product, now);
      return {
        entry,
        quantity: entry.quantity ?? 1,
        saleUnitPrice: sale.price,
        originalUnitPrice: sale.oldPrice ?? sale.price,
        isOnSale: sale.isOnSale,
      };
    });

    const campaigns = await this.loadActiveCampaigns(entries, now);

    // Kampanya eşiği için taban: sepet bağlamında satırların kampanya ÖNCESİ
    // toplamı (döngüsel olmaması için kampanya sonrası DEĞİL), aksi halde
    // satırın kendi tutarı.
    const cartBasis =
      options.minCartValueBasis === "cart"
        ? priced.reduce(
            (sum, line) => sum + line.saleUnitPrice * line.quantity,
            0,
          )
        : null;

    const ancestorsByCategory = await this.scope.resolveAncestors(
      campaigns,
      entries.map((entry) => entry.product),
    );

    for (const line of priced) {
      const { product } = line.entry;
      const basis = cartBasis ?? line.saleUnitPrice * line.quantity;
      const campaign = this.bestCampaignFor({
        product,
        unitPrice: line.saleUnitPrice,
        basis,
        campaigns,
        ancestorsByCategory,
      });

      result.set(product.id, {
        productId: product.id,
        originalUnitPrice: line.originalUnitPrice,
        saleUnitPrice: line.saleUnitPrice,
        unitPrice: campaign
          ? round2(line.saleUnitPrice - campaign.discountPerUnit)
          : line.saleUnitPrice,
        isOnSale: line.isOnSale,
        campaign,
      });
    }

    return result;
  }

  /**
   * Yürürlükteki kodsuz kampanyalar. Kapsam filtresi ürünlerin satıcı/kategori/
   * id kümesiyle daraltılır; kategori dalında ATA kategoriler de aranır, çünkü
   * üst kategoriye tanımlanan kampanya alt kategorideki ürünü de kapsar.
   */
  private async loadActiveCampaigns(
    entries: PriceableEntry[],
    now: Date,
  ): Promise<CampaignRow[]> {
    const sellerIds = [
      ...new Set(entries.map((e) => e.product.sellerId).filter(Boolean)),
    ];
    const productIds = entries.map((e) => e.product.id);

    return this.prisma.discount.findMany({
      where: {
        // Kod GEREKTİRMEYEN indirimler — toplu voucher şablonu buraya girmez
        // (bkz. discount-predicates.ts).
        ...activeAutomaticCampaignWhere(now),
        OR: [
          { scope: DiscountScope.global, sellerId: null },
          { scope: DiscountScope.seller, sellerId: { in: sellerIds } },
          // Kategori dalı burada daraltılmaz: eşleşme ata zinciriyle bellekte
          // yapılır. Kategori kampanyası az sayıdadır, ata id'lerini SQL'e
          // taşımak yerine hepsini çekip filtrelemek hem daha basit hem de
          // kategori ağacı değiştiğinde tutarsızlık üretmez.
          { scope: DiscountScope.category, categoryId: { not: null } },
          {
            scope: DiscountScope.product,
            targetProductIds: { hasSome: productIds },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        value: true,
        scope: true,
        sellerId: true,
        categoryId: true,
        targetProductIds: true,
        minCartValue: true,
        maxDiscountAmount: true,
      },
    });
  }

  /**
   * Uygun kampanyalar içinde alıcı lehine EN İYİSİ.
   *
   * Kampanyalar birbirinin üstüne BİNMEZ; `priority` ve `isStackable` alanları
   * bu kararda kullanılmaz (ikisi de hiçbir zaman uygulanmadı — bkz.
   * DiscountService). En düşük fiyat kazanır, eşitlikte ilk eşleşen.
   */
  private bestCampaignFor(params: {
    product: PriceableProduct;
    unitPrice: number;
    basis: number;
    campaigns: CampaignRow[];
    ancestorsByCategory: CategoryAncestors;
  }): CampaignMatch | null {
    const { product, unitPrice, basis, campaigns, ancestorsByCategory } =
      params;
    let best: CampaignMatch | null = null;

    for (const campaign of campaigns) {
      if (!this.scope.covers(product, campaign, ancestorsByCategory)) continue;

      // Minimum sepet tutarı: alan yıllardır kaydediliyor ama hiçbir kampanya
      // yolunda okunmuyordu — "500 TL üzeri %10" kampanyası 1 TL'lik sepete de
      // uygulanıyordu.
      const minCartValue = campaign.minCartValue;
      if (minCartValue != null && basis < num(minCartValue)) continue;

      const discountPerUnit = this.discountPerUnitOf(campaign, unitPrice);
      if (discountPerUnit <= 0) continue;

      if (!best || discountPerUnit > best.discountPerUnit) {
        best = {
          discountId: campaign.id,
          name: campaign.name,
          discountPerUnit,
        };
      }
    }

    return best;
  }

  /**
   * Kampanyanın birim başına indirdiği tutar — birim fiyatı asla aşmaz.
   *
   * `maxDiscountAmount` kampanyada BİRİM başına tavandır: kampanyanın çıktısı
   * ürün kartında gösterilen birim fiyattır, dolayısıyla tavan da birime
   * uygulanmalıdır. Satır başına uygulansaydı aynı ürün adet değiştikçe farklı
   * birim fiyat gösterir, "kartta gördüğün = ödediğin" bozulurdu. Aynı alan
   * KUPONDA sepet geneli tavandır (DiscountService.computeCouponDiscount) —
   * kupon sepete uygulanır, vitrinde hiç görünmez.
   */
  private discountPerUnitOf(campaign: CampaignRow, unitPrice: number): number {
    if (unitPrice <= 0) return 0;
    const value = num(campaign.value);
    if (value <= 0) return 0;

    const raw =
      campaign.type === DiscountType.percentage
        ? unitPrice * (value / 100)
        : value;

    const capped =
      campaign.maxDiscountAmount != null
        ? Math.min(raw, num(campaign.maxDiscountAmount))
        : raw;

    // Yüzde 100'ü aşan bozuk bir kampanya fiyatı negatife çeviremez.
    return round2(Math.min(capped, unitPrice));
  }
}
