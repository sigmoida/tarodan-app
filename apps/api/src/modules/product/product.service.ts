import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from "./dto";
import { ProductCreateService } from "./product-create.service";
import { ProductUpdateService } from "./product-update.service";
import { ProductQueryService } from "./product-query.service";
import { ProductFilterService } from "./product-filter.service";
import { ProductRankingService } from "./product-ranking.service";
import { ProductStatsService } from "./product-stats.service";
import { ProductEngagementService } from "./product-engagement.service";

/**
 * ProductService (facade) — CORE servis; her public imza aynen korunur (controller
 * enjekte eder). Yazma -> create/update, okuma/listeleme -> query, filtre metadatası
 * -> filter, sıralama skoru -> ranking, ilan istatistikleri -> stats, beğeni/görüntülenme
 * -> engagement. Paylaşılan yanıt DTO'su + attribute bağlama ProductCommonService'te.
 * DI grafı asiklik: sub -> common (+ create/update -> ranking/stats, tek yön); facade ->
 * {subs}; forwardRef yok. onModuleInit (products:list:* cache temizliği) facade'da kalır.
 */
@Injectable()
export class ProductService implements OnModuleInit {
  private readonly logger = new Logger(ProductService.name);

  onModuleInit() {
    this.cache
      .delPattern("products:list:*")
      .then((n) => {
        if (n > 0) this.logger.log(`Cleared ${n} product list cache key(s)`);
      })
      .catch(() => {});
  }

  constructor(
    private readonly cache: CacheService,
    private readonly createService: ProductCreateService,
    private readonly updateService: ProductUpdateService,
    private readonly queryService: ProductQueryService,
    private readonly filterService: ProductFilterService,
    private readonly rankingService: ProductRankingService,
    private readonly statsService: ProductStatsService,
    private readonly engagementService: ProductEngagementService,
  ) {}

  async create(sellerId: string, dto: CreateProductDto) {
    return this.createService.create(sellerId, dto);
  }

  async findAll(query: ProductQueryDto) {
    return this.queryService.findAll(query);
  }

  async findPopular(limit: number, page: number) {
    return this.queryService.findPopular(limit, page);
  }

  async findOne(id: string) {
    return this.queryService.findOne(id);
  }

  async findMyProductById(id: string, userId: string) {
    return this.queryService.findMyProductById(id, userId);
  }

  async findSimilarProducts(productId: string, limit = 12) {
    return this.queryService.findSimilarProducts(productId, limit);
  }

  async update(id: string, sellerId: string, dto: UpdateProductDto) {
    return this.updateService.update(id, sellerId, dto);
  }

  async remove(id: string, sellerId: string): Promise<void> {
    return this.updateService.remove(id, sellerId);
  }

  async findSellerProductById(sellerId: string, productId: string) {
    return this.queryService.findSellerProductById(sellerId, productId);
  }

  async findSellerProducts(sellerId: string, query: ProductQueryDto) {
    return this.queryService.findSellerProducts(sellerId, query);
  }

  async recomputeProductRanking(productId: string): Promise<void> {
    return this.rankingService.recomputeProductRanking(productId);
  }

  async getActiveListingCount(sellerId: string): Promise<number> {
    return this.statsService.getActiveListingCount(sellerId);
  }

  async likeProduct(
    productId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.engagementService.likeProduct(productId, userId);
  }

  async unlikeProduct(
    productId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.engagementService.unlikeProduct(productId, userId);
  }

  async isProductLikedByUser(
    productId: string,
    userId: string,
  ): Promise<boolean> {
    return this.engagementService.isProductLikedByUser(productId, userId);
  }

  async incrementViewCount(
    productId: string,
    userId?: string,
    clientIp?: string,
    userAgent?: string,
  ): Promise<{ viewCount: number }> {
    return this.engagementService.incrementViewCount(
      productId,
      userId,
      clientIp,
      userAgent,
    );
  }

  async getProductStats(productId: string, sellerId: string) {
    return this.statsService.getProductStats(productId, sellerId);
  }

  async getSellerListingStats(sellerId: string) {
    return this.statsService.getSellerListingStats(sellerId);
  }

  async getAttributeGroupsForManufacturer(manufacturer?: string) {
    return this.filterService.getAttributeGroupsForManufacturer(manufacturer);
  }

  async getFilters(manufacturer?: string) {
    return this.filterService.getFilters(manufacturer);
  }
}
