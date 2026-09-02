import { Controller, Get, Post, Query, Param, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SearchService,
  SearchOptions,
  SearchResponse,
  RichAutocompleteResult,
} from "./search.service";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserBlockService } from "../user-block/user-block.service";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminRole } from "@prisma/client";

@Controller("search")
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly configService: ConfigService,
    private readonly userBlocks: UserBlockService,
  ) {}

  @Public()
  @Get("products")
  async searchProducts(
    @Query("q") query: string,
    @Query("categoryId") categoryId?: string,
    @Query("brandId") brandId?: string,
    @Query("manufacturerId") manufacturerId?: string,
    @Query("carModelId") carModelId?: string,
    @Query("minPrice") minPrice?: string,
    @Query("maxPrice") maxPrice?: string,
    @Query("condition") condition?: string,
    @Query("brand") brand?: string,
    @Query("scale") scale?: string,
    @Query("material") material?: string,
    @Query("manufacturer") manufacturer?: string,
    @Query("tradeOnly") tradeOnly?: string,
    @Query("discountOnly") discountOnly?: string,
    @Query("preOrder") preOrder?: string,
    @Query("limited") limited?: string,
    @Query("set") setFilter?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @CurrentUser("id") viewerId?: string,
  ): Promise<SearchResponse> {
    const options: SearchOptions = {
      // Engelli satıcılar (simetrik) arama sonuçlarından düşer.
      excludeSellerIds: await this.userBlocks.getHiddenUserIds(viewerId),
      query: query || "",
      categoryId,
      brandId,
      manufacturerId,
      carModelId,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      condition,
      brand,
      scale,
      material,
      manufacturer,
      tradeOnly: tradeOnly === "true",
      discountOnly: discountOnly === "true",
      preOrder: preOrder === "true",
      limited: limited === "true",
      set: setFilter === "true",
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      sortBy,
    };

    return this.searchService.searchProducts(options);
  }

  @Public()
  @Get("autocomplete")
  async autocomplete(
    @Query("q") query: string,
    @Query("limit") limit?: string,
    @CurrentUser("id") viewerId?: string,
  ): Promise<{ suggestions: string[] }> {
    const suggestions = await this.searchService.autocomplete(
      query,
      limit ? parseInt(limit) : 10,
      await this.userBlocks.getHiddenUserIds(viewerId),
    );
    return { suggestions };
  }

  @Public()
  @Get("autocomplete-rich")
  async autocompleteRich(
    @Query("q") query: string,
    @CurrentUser("id") viewerId?: string,
  ): Promise<RichAutocompleteResult> {
    // Engelli satıcıların ilanları başlık önerilerinde de görünmez.
    return this.searchService.autocompleteRich(
      query || "",
      await this.userBlocks.getHiddenUserIds(viewerId),
    );
  }

  @Post("admin/reindex")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission("products")
  async reindexAll(): Promise<{ indexed: number }> {
    const indexed = await this.searchService.reindexAll();
    return { indexed };
  }

  /**
   * Koleksiyon indeksinin tam yeniden inşası. Ürün tarafındaki `admin/reindex`in
   * eşi; koleksiyon dokümanı da üye adını denormalize ettiği için kimlik
   * değişikliklerinden sonra production'da çalıştırılabilir olmalı
   * (bkz. docs/OPERATIONS.md).
   */
  @Post("admin/reindex-collections")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission("products")
  async reindexAllCollections(): Promise<{ indexed: number }> {
    const indexed = await this.searchService.reindexAllCollections();
    return { indexed };
  }

  @Post("admin/index/:productId")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission("products")
  async indexProduct(
    @Param("productId") productId: string,
  ): Promise<{ success: boolean }> {
    await this.searchService.indexProduct(productId);
    return { success: true };
  }

  @Public()
  @Get("dev/reindex")
  async devReindex(): Promise<{ indexed: number; message: string }> {
    const isDev = this.configService.get("NODE_ENV") === "development";
    if (!isDev) {
      return {
        indexed: 0,
        message: "Bu endpoint sadece development modunda çalışır",
      };
    }
    const indexed = await this.searchService.reindexAll();
    return {
      indexed,
      message: `${indexed} ürün Elasticsearch'e index'lendi.`,
    };
  }

  @Public()
  @Get("dev/reindex-collections")
  async devReindexCollections(): Promise<{ indexed: number; message: string }> {
    const isDev = this.configService.get("NODE_ENV") === "development";
    if (!isDev) {
      return {
        indexed: 0,
        message: "Bu endpoint sadece development modunda çalışır",
      };
    }
    const indexed = await this.searchService.reindexAllCollections();
    return {
      indexed,
      message: `${indexed} koleksiyon Elasticsearch'e index'lendi.`,
    };
  }

  @Public()
  @Get("status")
  async getStatus() {
    return this.searchService.getStatus();
  }
}
