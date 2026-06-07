import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Ip,
  Headers,
  Req,
  Logger,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ProductService } from './product.service';
import { ProductBoostService } from './product-boost.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  PaginatedProductsDto,
  InitiateBoostDto,
} from './dto';
import { PaymentProvider } from '../payment/dto';
import { JwtAuthGuard, Public, CurrentUser } from '../auth';

@ApiTags('products')
@Controller('products')
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly productBoostService: ProductBoostService,
  ) { }

  /**
   * GET /products
   * List products with filters (public)
   */
  @Get()
  @Public()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Ürün listesi' })
  @ApiResponse({
    status: 200,
    description: 'Ürün listesi',
    type: PaginatedProductsDto,
  })
  async findAll(@Query() query: ProductQueryDto) {
    try {
      return await this.productService.findAll(query);
    } catch (err) {
      this.logger.error('findAll failed', err instanceof Error ? err.stack : String(err));
      return {
        data: [],
        meta: {
          total: 0,
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          totalPages: 0,
        },
      };
    }
  }

  /**
   * GET /products/popular
   * Anasayfa Popüler İlanlar – sadece view count'a göre, indirim filtresi yok
   */
  @Get('popular')
  @Public()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @ApiOperation({ summary: 'Popüler ilanlar (görüntülenme sayısına göre)' })
  @ApiResponse({ status: 200, description: 'Popüler ürün listesi', type: PaginatedProductsDto })
  async getPopular(
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    return this.productService.findPopular(Number(limit) || 20, Number(page) || 1);
  }

  /**
   * GET /products/filters
   * Get dynamic filters (categories, brands, scales, manufacturers)
   */
  @Get('filters')
  @Public()
  @ApiOperation({ summary: 'Filtre seçenekleri (Categoriler, Markalar, vb.)' })
  @ApiResponse({ status: 200, description: 'Filtre listeleri' })
  async getFilters() {
    return this.productService.getFilters();
  }

  /**
   * GET /products/boost/pricing
   * Boost (öne çıkarma) süreleri ve fiyatları (admin'den ayarlanabilir)
   * NOTE: ':id' rotasından önce tanımlanmalı (statik segment çakışmasını önlemek için)
   */
  @Get('boost/pricing')
  @Public()
  @ApiOperation({ summary: 'Boost süre/fiyat listesi' })
  @ApiResponse({ status: 200, description: 'Boost fiyatlandırması' })
  async getBoostPricing() {
    return this.productBoostService.getPricing();
  }

  /**
   * GET /products/boost/my
   * Kullanıcının boost (öne çıkarma) geçmişi ve aktif boost'ları
   */
  @Get('boost/my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Boost geçmişim' })
  @ApiResponse({ status: 200, description: 'Kullanıcının boost kayıtları' })
  async getMyBoosts(@CurrentUser('id') userId: string) {
    return this.productBoostService.getMyBoosts(userId);
  }

  /**
   * GET /products/my
   * Get seller's own products (all statuses)
   */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kendi ürünlerim' })
  @ApiResponse({
    status: 200,
    description: 'Satıcının kendi ürünleri',
    type: PaginatedProductsDto,
  })
  async findMyProducts(
    @CurrentUser('id') sellerId: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.productService.findSellerProducts(sellerId, query);
  }

  /**
   * GET /products/my/stats
   * Get seller's listing statistics and membership limits
   * IMPORTANT: This route must be defined BEFORE 'my/:id' to avoid route conflicts
   */
  @Get('my/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'İlan istatistikleri ve limitleri',
    description: 'Kullanıcının ilan sayıları, üyelik limitleri ve kalan haklarını döner'
  })
  @ApiResponse({
    status: 200,
    description: 'İlan istatistikleri',
    schema: {
      type: 'object',
      properties: {
        counts: {
          type: 'object',
          properties: {
            pending: { type: 'number', description: 'Bekleyen ilanlar' },
            active: { type: 'number', description: 'Aktif ilanlar' },
            reserved: { type: 'number', description: 'Rezerve ilanlar' },
            sold: { type: 'number', description: 'Satılmış ilanlar' },
            rejected: { type: 'number', description: 'Reddedilen ilanlar' },
            total: { type: 'number', description: 'Toplam ilanlar' },
            activeListings: { type: 'number', description: 'Limite sayılan ilanlar (pending+active+reserved)' },
          },
        },
        limits: {
          type: 'object',
          properties: {
            tierName: { type: 'string', description: 'Üyelik adı' },
            tierType: { type: 'string', description: 'Üyelik tipi' },
            maxTotalListings: { type: 'number', description: 'Maksimum ilan hakkı' },
            remainingTotalListings: { type: 'number', description: 'Kalan ilan hakkı' },
            canCreateListing: { type: 'boolean', description: 'İlan oluşturabilir mi?' },
          },
        },
        summary: {
          type: 'object',
          properties: {
            used: { type: 'number', description: 'Kullanılan ilan sayısı' },
            max: { type: 'number', description: 'Maksimum ilan sayısı' },
            remaining: { type: 'number', description: 'Kalan ilan hakkı' },
            canCreate: { type: 'boolean', description: 'İlan oluşturabilir mi?' },
            percentUsed: { type: 'number', description: 'Kullanım yüzdesi' },
          },
        },
      },
    },
  })
  async getMyListingStats(@CurrentUser('id') sellerId: string) {
    if (!sellerId) {
      throw new BadRequestException('Kullanıcı kimliği bulunamadı');
    }
    try {
      return await this.productService.getSellerListingStats(sellerId);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error('getMyListingStats failed');
      throw new BadRequestException(`İlan istatistikleri alınamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  /**
   * GET /products/my/:id
   * Get seller's own product by ID (all statuses: active, inactive, sold, reserved, etc.)
   */
  @Get('my/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kendi ürünüm (düzenleme için)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Ürün detayı' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  @ApiResponse({ status: 403, description: 'Bu ürün size ait değil' })
  async findMyProductById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.productService.findMyProductById(id, userId);
  }

  /**
   * GET /products/:id
   * Get single product (public, but only shows active products)
   */
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Ürün detayı' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({
    status: 200,
    description: 'Ürün detayı',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Geçersiz ürün ID formatı' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async findOne(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı. UUID formatında olmalıdır (örn: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11)'),
    })) id: string,
  ) {
    return this.productService.findOne(id);
  }

  /**
   * POST /products
   * Create new product (seller only)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yeni ürün oluştur' })
  @ApiResponse({
    status: 201,
    description: 'Ürün oluşturuldu',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Geçersiz veri' })
  @ApiResponse({ status: 403, description: 'Satıcı hesabı gerekli' })
  async create(
    @CurrentUser('id') sellerId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(sellerId, dto);
  }

  /**
   * PATCH /products/:id
   * Update product (owner only)
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ürün güncelle' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({
    status: 200,
    description: 'Ürün güncellendi',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Geçersiz ürün ID formatı' })
  @ApiResponse({ status: 403, description: 'Yetkiniz yok' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  @ApiResponse({ status: 409, description: 'Concurrent update conflict' })
  async update(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, sellerId, dto);
  }

  /**
   * POST /products/:id/boost/initiate
   * İlanı öne çıkar (boost): süre seç → ödeme başlat. Sahiplik + aktiflik doğrulanır.
   */
  @Post(':id/boost/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'İlanı öne çıkar (boost satın al)' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({ status: 201, description: 'Boost ödemesi başlatıldı (paymentUrl döner)' })
  @ApiResponse({ status: 400, description: 'Geçersiz süre / ilan uygun değil' })
  @ApiResponse({ status: 403, description: 'Sadece kendi ilanınızı öne çıkarabilirsiniz' })
  async initiateBoost(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InitiateBoostDto,
    @Req() req: Request,
  ) {
    return this.productBoostService.initiateBoost(
      userId,
      id,
      dto.durationDays,
      dto.provider ?? PaymentProvider.paytr,
      dto.autoRenew ?? false,
      req,
    );
  }

  /**
   * DELETE /products/:id
   * Delete product (owner only)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ürün sil' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({ status: 200, description: 'Ürün silindi' })
  @ApiResponse({ status: 400, description: 'Geçersiz ürün ID formatı' })
  @ApiResponse({ status: 403, description: 'Yetkiniz yok' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async remove(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.productService.remove(id, sellerId);
  }

  // ==========================================================================
  // PRODUCT LIKE & VIEW SYSTEM (Business Dashboard Feature)
  // ==========================================================================

  /**
   * POST /products/:id/like
   * Like a product
   */
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ürünü beğen' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({
    status: 201,
    description: 'Ürün beğenildi',
    schema: {
      type: 'object',
      properties: {
        liked: { type: 'boolean', example: true },
        likeCount: { type: 'number', example: 42 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Zaten beğenilmiş' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async likeProduct(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.productService.likeProduct(id, userId);
  }

  /**
   * DELETE /products/:id/unlike
   * Remove like from a product
   */
  @Delete(':id/unlike')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Beğeniyi kaldır' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({
    status: 200,
    description: 'Beğeni kaldırıldı',
    schema: {
      type: 'object',
      properties: {
        liked: { type: 'boolean', example: false },
        likeCount: { type: 'number', example: 41 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Beğenilmemiş' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async unlikeProduct(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.productService.unlikeProduct(id, userId);
  }

  /**
   * POST /products/:id/view
   * Increment view count (public, but rate limited per user)
   */
  @Post(':id/view')
  @Public()
  @ApiOperation({ summary: 'Görüntülenme sayısını artır' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({
    status: 201,
    description: 'Görüntülenme sayısı artırıldı',
    schema: {
      type: 'object',
      properties: {
        viewCount: { type: 'number', example: 156 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async incrementViewCount(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') userId?: string,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: any,
  ) {
    // Get real IP from headers if behind proxy
    const clientIp =
      req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req?.headers?.['x-real-ip'] ||
      ip ||
      'unknown';
    return this.productService.incrementViewCount(id, userId, clientIp, userAgent);
  }

  /**
   * GET /products/:id/stats
   * Get product stats (seller only)
   */
  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ürün istatistikleri (satıcı için)' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({
    status: 200,
    description: 'Ürün istatistikleri',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        viewCount: { type: 'number' },
        likeCount: { type: 'number' },
        offersCount: { type: 'number' },
        ordersCount: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Yetkiniz yok' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async getProductStats(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.productService.getProductStats(id, sellerId);
  }

  /**
   * GET /products/:id/liked
   * Check if user has liked a product
   */
  @Get(':id/liked')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kullanıcı bu ürünü beğenmiş mi?' })
  @ApiParam({ name: 'id', description: 'Product ID (UUID format)' })
  @ApiResponse({
    status: 200,
    description: 'Beğeni durumu',
    schema: {
      type: 'object',
      properties: {
        liked: { type: 'boolean' },
      },
    },
  })
  async isProductLiked(
    @Param('id', new ParseUUIDPipe({
      errorHttpStatusCode: 400,
      exceptionFactory: () => new BadRequestException('Geçersiz ürün ID formatı'),
    })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const liked = await this.productService.isProductLikedByUser(id, userId);
    return { liked };
  }
}
