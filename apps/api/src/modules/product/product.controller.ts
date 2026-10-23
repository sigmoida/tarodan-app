import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Ip,
  Headers,
  Req,
  Logger,
  Header,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { Request } from "express";
import { engagementClientIp } from "./helpers/engagement-client-ip";
import { type Locale } from "@tarodan/i18n";
import { ProductService } from "./product.service";
import { ProductBoostService } from "./ranking/product-boost.service";
import { BoostSellerService } from "./boost-seller/boost-seller.service";
import { BoostOfferService } from "./boost-seller/boost-offer.service";
import { ProductRenewalService } from "./lifecycle/product-renewal.service";
import {
  CreateProductDto,
  DeleteProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  PaginatedProductsDto,
  InitiateBoostDto,
  MyBoostsQueryDto,
  BoostReminderDto,
  DismissBoostOffersDto,
  RenewProductsDto,
} from "./dto";
import type {
  BoostOffersResponse,
  BoostReminderResponse,
  MyBoostsResponse,
} from "@tarodan/types";
import { PaymentProvider } from "../payment/dto";
import { JwtAuthGuard, Public, CurrentUser } from "../auth";
import { I18nService, ReqLocale, i18nMessage } from "../i18n";
import { errorStack } from "../../common/helpers/error-message";
import {
  LISTING_ID_PARAM_DESCRIPTION,
  ListingIdParam,
} from "../../common/pipes/listing-id.pipe";

@ApiTags("products")
@Controller("products")
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly productBoostService: ProductBoostService,
    private readonly boostSellerService: BoostSellerService,
    private readonly boostOfferService: BoostOfferService,
    private readonly productRenewalService: ProductRenewalService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * GET /products
   * List products with filters (public).
   */
  @Get()
  @Public()
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  @Header("Pragma", "no-cache")
  @ApiOperation({ summary: "Product list" })
  @ApiResponse({
    status: 200,
    description: "Product list (an empty result is an empty page)",
    type: PaginatedProductsDto,
  })
  @ApiResponse({
    status: 500,
    description:
      "The list could not be read; never answered as an empty 200 page",
  })
  findAll(
    @Query() query: ProductQueryDto,
    @CurrentUser("id") viewerId?: string,
  ) {
    // A failure reaches AllExceptionsFilter (sanitised 5xx + Sentry). An
    // empty 200 here was cached by the web home as "no listings".
    return this.productService.findAll(query, viewerId);
  }

  /**
   * GET /products/popular
   * Anasayfa Popüler İlanlar – sadece view count'a göre, indirim filtresi yok
   */
  @Get("popular")
  @Public()
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  @ApiOperation({ summary: "Popüler ilanlar (görüntülenme sayısına göre)" })
  @ApiResponse({
    status: 200,
    description: "Popüler ürün listesi",
    type: PaginatedProductsDto,
  })
  async getPopular(
    @Query("limit") limit?: number,
    @Query("page") page?: number,
    @CurrentUser("id") viewerId?: string,
  ) {
    return this.productService.findPopular(
      Number(limit) || 20,
      Number(page) || 1,
      viewerId,
    );
  }

  /**
   * GET /products/filters
   * Get dynamic filters (categories, brands, scales, manufacturers).
   * Optional ?manufacturer=<slug> adds manufacturer-scoped attribute groups
   * (e.g. Hot Wheels Segment/Assortment/Wheel Type/etc.) to customAttributes.
   */
  @Get("filters")
  @Public()
  @ApiOperation({ summary: "Filtre seçenekleri (Categoriler, Markalar, vb.)" })
  @ApiResponse({ status: 200, description: "Filtre listeleri" })
  async getFilters(@Query("manufacturer") manufacturer?: string) {
    return this.productService.getFilters(manufacturer);
  }

  /**
   * GET /products/attribute-groups?manufacturer=<slug>
   * Returns attribute groups (with attributes) applicable to the given manufacturer.
   * Always includes global groups (manufacturerSlug=null) PLUS manufacturer-scoped groups.
   * Used by listing creation forms to render conditional fields.
   */
  @Get("attribute-groups")
  @Public()
  @ApiOperation({
    summary: "Manufacturer-aware attribute group listesi (form için)",
  })
  @ApiResponse({ status: 200, description: "Form alan grupları" })
  async getAttributeGroups(@Query("manufacturer") manufacturer?: string) {
    return this.productService.getAttributeGroupsForManufacturer(manufacturer);
  }

  /**
   * GET /products/:id/boost/options
   * The packages, durations and prices the owner can buy for the listing,
   * matched to its price. Owner of an active listing only.
   */
  @Get(":id/boost/options")
  @ApiOperation({ summary: "Boost package options for the owner's listing" })
  @ApiResponse({
    status: 200,
    description: "Packages with durations and prices",
  })
  @ApiResponse({
    status: 404,
    description: "No such listing, or not the caller's listing",
  })
  @ApiResponse({
    status: 400,
    description:
      "Malformed listing id (server.product.invalidIdFormat), or the listing is not active",
  })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  async getBoostOptions(
    @ListingIdParam("id", "server.product.invalidIdFormat") id: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.productBoostService.getBoostOptions(id, userId);
  }

  /**
   * GET /products/boost/my?state=current|history&page&limit
   * "My boosts": the caller's running and paused boosts, or the ended and
   * cancelled ones, newest first, in the list envelope `{ data, meta }`.
   * The `boost/...` routes stay before the `:id` routes.
   */
  @Get("boost/my")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "My boosts (current or history)" })
  @ApiResponse({
    status: 200,
    description: "{ data: MyBoostRow[], meta } (pending and failed never)",
  })
  async getMyBoosts(
    @CurrentUser("id") userId: string,
    @Query() query: MyBoostsQueryDto,
  ): Promise<MyBoostsResponse> {
    return this.boostSellerService.getMyBoosts(userId, query);
  }

  /**
   * GET /products/boost/offers
   * The caller's listings due the one-time boost offer (web dialog).
   */
  @Get("boost/offers")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Listings due the one-time boost offer" })
  @ApiResponse({
    status: 200,
    description: "{ enabled, offers } newest first, at most 20",
  })
  async getBoostOffers(
    @CurrentUser("id") userId: string,
  ): Promise<BoostOffersResponse> {
    return this.boostOfferService.getOffers(userId);
  }

  /**
   * POST /products/boost/offers/dismiss
   * The offers shown are never shown again (own listings only).
   */
  @Post("boost/offers/dismiss")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Dismiss boost offers (once per listing)" })
  @ApiResponse({
    status: 204,
    description:
      "Recorded for the caller's own listings; other ids are ignored",
  })
  @ApiResponse({ status: 400, description: "1 to 20 listing UUIDs" })
  async dismissBoostOffers(
    @CurrentUser("id") userId: string,
    @Body() dto: DismissBoostOffersDto,
  ): Promise<void> {
    await this.boostOfferService.dismissOffers(userId, dto.productIds);
  }

  /**
   * PATCH /products/:id/boost/reminder
   * The ending-soon reminder of the owner's running and paused boosts of the
   * listing (premium to turn on; never a charge).
   */
  @Patch(":id/boost/reminder")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Turn the boost ending-soon reminder on or off" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 200,
    description: "{ enabled } (false when no boost of the listing runs)",
  })
  @ApiResponse({
    status: 400,
    description:
      "Turning it on without premium (server.product.boostReminderPremiumOnly)",
  })
  @ApiResponse({
    status: 404,
    description: "No such listing, or not the caller's listing",
  })
  async setBoostReminder(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") userId: string,
    @Body() dto: BoostReminderDto,
  ): Promise<BoostReminderResponse> {
    return this.boostSellerService.setReminder(userId, id, dto.enabled);
  }

  /**
   * GET /products/my
   * Get seller's own products (all statuses)
   */
  @Get("my")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Kendi ürünlerim" })
  @ApiResponse({
    status: 200,
    description: "Satıcının kendi ürünleri",
    type: PaginatedProductsDto,
  })
  async findMyProducts(
    @CurrentUser("id") sellerId: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.productService.findSellerProducts(sellerId, query);
  }

  /**
   * GET /products/my/stats
   * Get seller's listing statistics and membership limits
   * IMPORTANT: This route must be defined BEFORE 'my/:id' to avoid route conflicts
   */
  @Get("my/stats")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "İlan istatistikleri ve limitleri",
    description:
      "Kullanıcının ilan sayıları, üyelik limitleri ve kalan haklarını döner",
  })
  @ApiResponse({
    status: 200,
    description: "İlan istatistikleri",
    schema: {
      type: "object",
      properties: {
        counts: {
          type: "object",
          properties: {
            pending: { type: "number", description: "Bekleyen ilanlar" },
            active: { type: "number", description: "Aktif ilanlar" },
            reserved: { type: "number", description: "Rezerve ilanlar" },
            sold: { type: "number", description: "Satılmış ilanlar" },
            rejected: { type: "number", description: "Reddedilen ilanlar" },
            total: { type: "number", description: "Toplam ilanlar" },
            activeListings: {
              type: "number",
              description: "Limite sayılan ilanlar (pending+active+reserved)",
            },
          },
        },
        limits: {
          type: "object",
          properties: {
            tierName: { type: "string", description: "Üyelik adı" },
            tierType: { type: "string", description: "Üyelik tipi" },
            maxTotalListings: {
              type: "number",
              description: "Maksimum ilan hakkı",
            },
            remainingTotalListings: {
              type: "number",
              description: "Kalan ilan hakkı",
            },
            canCreateListing: {
              type: "boolean",
              description: "İlan oluşturabilir mi?",
            },
          },
        },
        summary: {
          type: "object",
          properties: {
            used: { type: "number", description: "Kullanılan ilan sayısı" },
            max: { type: "number", description: "Maksimum ilan sayısı" },
            remaining: { type: "number", description: "Kalan ilan hakkı" },
            canCreate: {
              type: "boolean",
              description: "İlan oluşturabilir mi?",
            },
            percentUsed: { type: "number", description: "Kullanım yüzdesi" },
          },
        },
      },
    },
  })
  async getMyListingStats(@CurrentUser("id") sellerId: string) {
    if (!sellerId) {
      throw new BadRequestException(
        i18nMessage("server.product.userIdNotFound"),
      );
    }
    try {
      return await this.productService.getSellerListingStats(sellerId);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error("getMyListingStats failed", errorStack(error));
      throw new BadRequestException(
        i18nMessage("server.product.listingStatsFailed"),
      );
    }
  }

  /**
   * GET /products/my/:id
   * Get seller's own product by ID (all statuses: active, inactive, sold, reserved, etc.)
   */
  @Get("my/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  // Düzenleme ekranını besleyen uç: bayat yanıt, satıcının o an geçerli olmayan
  // değerleri geri kaydetmesi demek. Tarayıcının sezgisel önbelleği ve araya
  // giren proxy'ler kapatılır (`/products` ve `/products/popular` ile aynı).
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  @Header("Pragma", "no-cache")
  @ApiOperation({ summary: "Kendi ürünüm (düzenleme için)" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({ status: 200, description: "Ürün detayı" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  @ApiResponse({ status: 403, description: "Bu ürün size ait değil" })
  async findMyProductById(
    @ListingIdParam("id") id: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.productService.findMyProductById(id, userId);
  }

  /**
   * GET /products/:id
   * Get single product (public, but only shows active products)
   */
  @Get(":id")
  @Public()
  @ApiOperation({ summary: "Ürün detayı" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 200,
    description: "Ürün detayı",
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: "Geçersiz ürün ID formatı" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  async findOne(
    @ListingIdParam("id", "server.product.invalidIdFormatDetailed")
    id: string,
    @CurrentUser("id") viewerId?: string,
  ) {
    return this.productService.findOne(id, viewerId);
  }

  /**
   * GET /products/:id/similar
   * Aynı kategoriden, aktif ve stoklu ürünler. Stockout sonrası
   * "alternatif ürünler" sayfası tarafından kullanılır.
   */
  @Get(":id/similar")
  @Public()
  @ApiOperation({ summary: "Benzer ürünler (aynı kategori, aktif)" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  async getSimilar(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @Query("limit") limit?: string,
    @CurrentUser("id") viewerId?: string,
  ) {
    const n = limit ? Math.min(parseInt(limit, 10) || 12, 24) : 12;
    return this.productService.findSimilarProducts(id, n, viewerId);
  }

  /**
   * POST /products
   * Create new product (seller only)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Yeni ürün oluştur" })
  @ApiResponse({
    status: 201,
    description: "Ürün oluşturuldu",
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: "Geçersiz veri" })
  @ApiResponse({ status: 403, description: "Satıcı hesabı gerekli" })
  async create(
    @CurrentUser("id") sellerId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(sellerId, dto);
  }

  /**
   * POST /products/my/renew
   * Süresi dolmuş birden çok ilanı yenile. Her ilan kendi sonucuyla döner
   * (kısmi başarı); "my/renew" `:id/renew`'den ÖNCE tanımlı kalmalı.
   */
  @Post("my/renew")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Süresi dolan ilanları yenile (toplu)",
    description:
      "İçeriği son onaydan beri değişmeyen ilan doğrudan yayına döner; değişen/onay izi olmayan ilan onaya düşer. Üyelik ilan limiti ve diğer kapılar aynen geçerlidir; başarısız ilanlar sonuç listesinde gerekçesiyle döner.",
  })
  @ApiResponse({ status: 201, description: "İlan başına sonuç" })
  async renewMany(
    @CurrentUser("id") sellerId: string,
    @Body() dto: RenewProductsDto,
  ) {
    return this.productRenewalService.renewMany(sellerId, dto.ids);
  }

  /**
   * POST /products/:id/renew
   * Süresi dolmuş tek ilanı yenile (owner only).
   */
  @Post(":id/renew")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Süresi dolan ilanı yenile" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 201,
    description: "Yenilendi (active) ya da onaya düştü (pending)",
  })
  @ApiResponse({
    status: 400,
    description: "İlanın süresi dolmamış / stok yok",
  })
  @ApiResponse({ status: 403, description: "Yetkiniz yok / ilan limiti" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  async renew(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") sellerId: string,
  ) {
    return this.productRenewalService.renew(sellerId, id);
  }

  /**
   * PATCH /products/:id
   * Update product (owner only)
   */
  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Ürün güncelle" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 200,
    description: "Ürün güncellendi",
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: "Geçersiz ürün ID formatı" })
  @ApiResponse({ status: 403, description: "Yetkiniz yok" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  @ApiResponse({ status: 409, description: "Concurrent update conflict" })
  async update(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") sellerId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, sellerId, dto);
  }

  /**
   * POST /products/:id/boost/initiate
   * Boost a listing: package, duration, the price the dialog showed and both
   * purchase consents, then the payment intent. Ownership and the active
   * status are checked; a changed price is a 409 with nothing written.
   */
  @Post(":id/boost/initiate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Boost a listing (buy a boost)" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 201,
    description:
      "Boost payment started (paymentId; card entry via /payments/direct-form)",
  })
  @ApiResponse({
    status: 400,
    description:
      "A consent is not true (server.product.boostConsentRequired), no package, no valid expectedPrice (a JSON number with at most two decimals), a package or duration without a tier for the listing's price, or the listing is not active",
  })
  @ApiResponse({
    status: 403,
    description: "Only your own listing can be boosted",
  })
  @ApiResponse({
    status: 409,
    description:
      "expectedPrice is not the price charged now (server.product.boostPriceChanged); nothing is written",
  })
  async initiateBoost(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") userId: string,
    @Body() dto: InitiateBoostDto,
    @Req() req: Request,
  ) {
    return this.productBoostService.initiateBoost(
      userId,
      id,
      {
        packageId: dto.packageId,
        durationDays: dto.durationDays,
        expectedPrice: dto.expectedPrice,
        provider: dto.provider ?? PaymentProvider.paytr,
        autoRenew: dto.autoRenew ?? false,
        preInformationAccepted: dto.preInformationAccepted,
        withdrawalWaiverAccepted: dto.withdrawalWaiverAccepted,
      },
      req,
    );
  }

  /**
   * DELETE /products/:id
   * Delete product (owner only). Opsiyonel gövde: silme nedeni
   * (`removalReason`, `removalPlatform`, `removalDetail`) — gönderilmezse
   * `not_given` kaydedilir (eski mobil sürümler).
   */
  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Ürün sil",
    description:
      "Optional JSON body with the removal reason (DeleteProductDto). Omitted reason is recorded as not_given.",
  })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({ status: 200, description: "Ürün silindi" })
  @ApiResponse({
    status: 400,
    description: "Geçersiz ürün ID formatı ya da geçersiz silme nedeni",
  })
  @ApiResponse({ status: 403, description: "Yetkiniz yok" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  async remove(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") sellerId: string,
    @ReqLocale() locale: Locale,
    @Body() dto: DeleteProductDto,
  ) {
    await this.productService.remove(id, sellerId, dto);
    return { message: this.i18n.translate("server.product.deleted", locale) };
  }

  // ==========================================================================
  // PRODUCT LIKE & VIEW SYSTEM (Business Dashboard Feature)
  // ==========================================================================

  /**
   * POST /products/:id/like
   * Like a product
   */
  @Post(":id/like")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Ürünü beğen" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 201,
    description: "Ürün beğenildi",
    schema: {
      type: "object",
      properties: {
        liked: { type: "boolean", example: true },
        likeCount: { type: "number", example: 42 },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Zaten beğenilmiş" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  async likeProduct(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.productService.likeProduct(id, userId);
  }

  /**
   * DELETE /products/:id/unlike
   * Remove like from a product
   */
  @Delete(":id/unlike")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Beğeniyi kaldır" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 200,
    description: "Beğeni kaldırıldı",
    schema: {
      type: "object",
      properties: {
        liked: { type: "boolean", example: false },
        likeCount: { type: "number", example: 41 },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Beğenilmemiş" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  async unlikeProduct(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.productService.unlikeProduct(id, userId);
  }

  /**
   * POST /products/:id/view
   * Increment view count (public, but rate limited per user)
   */
  @Post(":id/view")
  @Public()
  @ApiOperation({ summary: "Görüntülenme sayısını artır" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 201,
    description: "Görüntülenme sayısı artırıldı",
    schema: {
      type: "object",
      properties: {
        viewCount: { type: "number", example: 156 },
      },
    },
  })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  async incrementViewCount(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") userId?: string,
    @Ip() ip?: string,
    @Headers("user-agent") userAgent?: string,
    @Req() req?: Request,
  ) {
    return this.productService.incrementViewCount(
      id,
      userId,
      engagementClientIp(req, ip),
      userAgent,
    );
  }

  /**
   * POST /products/:id/click
   * Count a marketplace listing-card click separately from detail views.
   */
  @Post(":id/click")
  @Public()
  @ApiOperation({ summary: "İlan kartı tıklama sayısını artır" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  async incrementClickCount(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") userId?: string,
    @Ip() ip?: string,
    @Headers("user-agent") userAgent?: string,
    @Req() req?: Request,
  ) {
    return this.productService.incrementClickCount(
      id,
      userId,
      engagementClientIp(req, ip),
      userAgent,
    );
  }

  /**
   * GET /products/:id/stats
   * Get product stats (seller only)
   */
  @Get(":id/stats")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Ürün istatistikleri (satıcı için)" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 200,
    description: "Ürün istatistikleri",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        viewCount: { type: "number" },
        likeCount: { type: "number" },
        offersCount: { type: "number" },
        ordersCount: { type: "number" },
      },
    },
  })
  @ApiResponse({ status: 403, description: "Yetkiniz yok" })
  @ApiResponse({ status: 404, description: "Ürün bulunamadı" })
  async getProductStats(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") sellerId: string,
  ) {
    return this.productService.getProductStats(id, sellerId);
  }

  /**
   * GET /products/:id/liked
   * Check if user has liked a product
   */
  @Get(":id/liked")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Kullanıcı bu ürünü beğenmiş mi?" })
  @ApiParam({ name: "id", description: LISTING_ID_PARAM_DESCRIPTION })
  @ApiResponse({
    status: 200,
    description: "Beğeni durumu",
    schema: {
      type: "object",
      properties: {
        liked: { type: "boolean" },
      },
    },
  })
  async isProductLiked(
    @ListingIdParam("id", "server.product.invalidIdFormat")
    id: string,
    @CurrentUser("id") userId: string,
  ) {
    const liked = await this.productService.isProductLikedByUser(id, userId);
    return { liked };
  }
}
