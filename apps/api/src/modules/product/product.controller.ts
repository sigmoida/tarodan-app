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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  PaginatedProductsDto,
} from './dto';
import { JwtAuthGuard, Public, CurrentUser } from '../auth';

@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * GET /products
   * List products with filters (public)
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Ürün listesi' })
  @ApiResponse({
    status: 200,
    description: 'Ürün listesi',
    type: PaginatedProductsDto,
  })
  async findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
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
    console.log('[getMyListingStats] Called with sellerId:', sellerId);
    if (!sellerId) {
      throw new BadRequestException('Kullanıcı kimliği bulunamadı');
    }
    try {
      console.log('[getMyListingStats] Calling getSellerListingStats for sellerId:', sellerId);
      const result = await this.productService.getSellerListingStats(sellerId);
      console.log('[getMyListingStats] Success, returning result');
      return result;
    } catch (error) {
      console.error('[getMyListingStats] Error for sellerId:', sellerId, error);
      console.error('[getMyListingStats] Error details:', error instanceof Error ? error.message : String(error));
      console.error('[getMyListingStats] Error stack:', error instanceof Error ? error.stack : 'No stack');
      // Re-throw known exceptions
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      // Wrap unknown errors with more context
      throw new BadRequestException(`İlan istatistikleri alınamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
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
