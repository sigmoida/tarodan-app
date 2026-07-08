import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard, CurrentUser, Public } from '../auth';
import {
  UpdateProfileDto,
  CreateAddressDto,
  UpdateAddressDto,
  UpsertBankAccountDto,
  UpdateNotificationSettingsDto,
} from './dto';

@ApiTags('users')
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  /**
   * GET /users/me
   * Get current user profile with addresses
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mevcut kullanıcı bilgileri' })
  @ApiResponse({ status: 200, description: 'Kullanıcı bilgileri' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.userService.findByIdWithAddresses(userId);
  }

  /**
   * PATCH /users/me
   * Update current user profile
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil güncelle' })
  @ApiResponse({ status: 200, description: 'Profil güncellendi' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  /**
   * GET /users/me/settings
   * Get current user notification settings
   */
  @Get('me/settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bildirim tercihleri' })
  @ApiResponse({ status: 200, description: 'Bildirim tercihleri' })
  async getSettings(@CurrentUser('id') userId: string) {
    return this.userService.getNotificationSettings(userId);
  }

  /**
   * PATCH /users/me/settings
   * Update current user notification settings (partial)
   */
  @Patch('me/settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bildirim tercihlerini güncelle' })
  @ApiResponse({ status: 200, description: 'Bildirim tercihleri güncellendi' })
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.userService.updateNotificationSettings(userId, dto);
  }

  /**
   * DELETE /users/me
   * Delete current user account
   */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Hesabı sil',
    description: 'Hesabı silmek için tüm ilanlar kaldırılmış, aktif takas teklifi ve bekleyen sipariş olmamalıdır.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Hesap silindi',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Hesap silinemez - aktif ilan, takas veya sipariş var',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        errors: { type: 'array', items: { type: 'string' } },
        details: {
          type: 'object',
          properties: {
            activeProducts: { type: 'number' },
            activeTrades: { type: 'number' },
            pendingOrders: { type: 'number' },
          },
        },
      },
    },
  })
  async deleteAccount(@CurrentUser('id') userId: string) {
    return this.userService.deleteAccount(userId);
  }

  /**
   * GET /users/me/analytics
   * Get user analytics data
   */
  @Get('me/analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Kullanıcı analitik verileri',
    description: 'Görüntüleme, beğeni, satış ve gelir istatistiklerini döner.'
  })
  @ApiQuery({ name: 'period', required: false, enum: ['7d', '30d', '90d'], description: 'Dönem filtresi' })
  @ApiResponse({ 
    status: 200, 
    description: 'Analitik verileri',
    schema: {
      type: 'object',
      properties: {
        totalViews: { type: 'number' },
        totalFavorites: { type: 'number' },
        totalSales: { type: 'number' },
        totalRevenue: { type: 'number' },
        activeListings: { type: 'number' },
        pendingOrders: { type: 'number' },
        viewsChange: { type: 'number' },
        favoritesChange: { type: 'number' },
        salesChange: { type: 'number' },
        revenueChange: { type: 'number' },
        topProducts: { type: 'array', items: { type: 'object' } },
        dailyViews: { type: 'array', items: { type: 'object' } },
        recentActivity: { type: 'array', items: { type: 'object' } },
        categoryStats: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async getUserAnalytics(
    @CurrentUser('id') userId: string,
    @Query('period') period?: '7d' | '30d' | '90d',
  ) {
    return this.userService.getUserAnalytics(userId, period || '30d');
  }

  /**
   * GET /users/me/stats
   * Kullanıcının özet istatistikleri (İstatistikler sayfası)
   */
  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Kullanıcı özet istatistikleri',
    description:
      'İlan, sipariş, takas, koleksiyon sayıları ile toplam harcama/gelir ve değerlendirme puanını döner.',
  })
  @ApiResponse({ status: 200, description: 'Özet istatistikler' })
  async getMyStats(@CurrentUser('id') userId: string) {
    return this.userService.getMyStats(userId);
  }

  /**
   * POST /users/me/seller
   * Upgrade to seller account
   */
  @Post('me/seller')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Satıcı hesabına yükselt' })
  @ApiResponse({ status: 200, description: 'Satıcı hesabına yükseltildi' })
  async upgradeToSeller(@CurrentUser('id') userId: string) {
    return this.userService.upgradToSeller(userId);
  }

  /**
   * GET /users/me/addresses
   * Get current user's addresses
   */
  @Get('me/addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adreslerim' })
  @ApiResponse({ status: 200, description: 'Adres listesi' })
  async getAddresses(@CurrentUser('id') userId: string) {
    return this.userService.getAddresses(userId);
  }

  /**
   * POST /users/me/addresses
   * Add new address
   */
  @Post('me/addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yeni adres ekle' })
  @ApiResponse({ status: 201, description: 'Adres eklendi' })
  async addAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.userService.addAddress(userId, dto);
  }

  /**
   * PATCH /users/me/addresses/:id
   * Update address
   */
  @Patch('me/addresses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adres güncelle' })
  @ApiResponse({ status: 200, description: 'Adres güncellendi' })
  async updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.userService.updateAddress(userId, addressId, dto);
  }

  /**
   * DELETE /users/me/addresses/:id
   * Delete address
   */
  @Delete('me/addresses/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adres sil' })
  @ApiResponse({ status: 200, description: 'Adres silindi' })
  async deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    return this.userService.deleteAddress(userId, addressId);
  }

  /**
   * GET /users/me/following
   * Get users that current user is following
   */
  @Get('me/following')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Takip ettiklerim' })
  @ApiResponse({ status: 200, description: 'Takip edilen kullanıcılar' })
  async getFollowing(@CurrentUser('id') userId: string) {
    return this.userService.getFollowing(userId);
  }

  /**
   * GET /users/:id/profile
   * Get public user profile (no auth required)
   */
  @Get(':id/profile')
  @Public()
  @ApiOperation({ summary: 'Kullanıcı profili görüntüle' })
  @ApiResponse({ status: 200, description: 'Kullanıcı profili' })
  async getUserProfile(
    @Param('id') userId: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    // Token gönderildiyse (sahip kendi profiline bakıyorsa) viewerId dolu gelir;
    // @Public rota olduğu için token yoksa null → sayaçlar herkese görünür modda döner.
    return this.userService.getPublicProfile(userId, viewerId ?? undefined);
  }

  /**
   * GET /users/:id/avatar
   * Stabil avatar URL'i — taze presigned URL'e 302 redirect eder.
   * Avatar'lar private S3'te tutulur ve presigned URL'ler 24s'te geçersizleşir;
   * bu sabit endpoint istemci tarafında cache'lenebilir, redirect her istekte
   * geçerli bir URL üretir. @Public: <Image> Authorization header gönderemez,
   * profil fotoğrafları da zaten herkese açıktır.
   */
  @Get(':id/avatar')
  @Public()
  @ApiOperation({ summary: 'Kullanıcı avatarı (stabil URL → presigned redirect)' })
  async getUserAvatar(@Param('id') userId: string, @Res() res: Response) {
    const url = await this.userService.getAvatarRedirectUrl(userId);
    if (!url) {
      // Avatar yok / çözülemedi → 404; istemci <Image> onError ile baş harfe düşer.
      res.status(404).end();
      return;
    }
    // Redirect'i kısa süre cache'le (presigned URL 24s geçerli; bol pay var).
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.redirect(302, url);
  }

  /**
   * GET /users/:id/follow
   * Check if current user is following target user
   */
  @Get(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Takip durumunu kontrol et' })
  @ApiResponse({ status: 200, description: 'Takip durumu' })
  async checkFollowing(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.checkFollowing(currentUserId, targetUserId);
  }

  /**
   * POST /users/:id/follow
   * Follow a user
   */
  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kullanıcıyı takip et' })
  @ApiResponse({ status: 200, description: 'Takip edildi' })
  async followUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.followUser(currentUserId, targetUserId);
  }

  /**
   * DELETE /users/:id/follow
   * Unfollow a user
   */
  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Takibi bırak' })
  @ApiResponse({ status: 200, description: 'Takip bırakıldı' })
  async unfollowUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.unfollowUser(currentUserId, targetUserId);
  }

  // ==========================================================================
  // USER BLOCKING
  // ==========================================================================

  /**
   * POST /users/:id/block
   * Block a user
   */
  @Post(':id/block')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kullanıcıyı engelle' })
  @ApiResponse({ status: 200, description: 'Kullanıcı engellendi' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek' })
  @ApiResponse({ status: 404, description: 'Kullanıcı bulunamadı' })
  async blockUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.blockUser(currentUserId, targetUserId);
  }

  /**
   * DELETE /users/:id/block
   * Unblock a user
   */
  @Delete(':id/block')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Engeli kaldır' })
  @ApiResponse({ status: 200, description: 'Engel kaldırıldı' })
  @ApiResponse({ status: 404, description: 'Engel bulunamadı' })
  async unblockUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.unblockUser(currentUserId, targetUserId);
  }

  /**
   * GET /users/me/blocked
   * Get list of blocked users
   */
  @Get('me/blocked')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Engellenen kullanıcılar listesi' })
  @ApiResponse({ status: 200, description: 'Engellenen kullanıcılar' })
  async getBlockedUsers(@CurrentUser('id') userId: string) {
    return this.userService.getBlockedUsers(userId);
  }

  // ==========================================================================
  // BUSINESS DASHBOARD & FEATURED ENDPOINTS
  // ==========================================================================

  /**
   * GET /users/me/business-stats
   * Get business dashboard statistics (only for business accounts)
   */
  @Get('me/business-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'İşletme dashboard istatistikleri',
    description: 'Sadece işletme hesapları için geçerlidir. Ürün ve koleksiyon istatistikleri, görüntülenme, beğeni sayıları ve trendler döner.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'İşletme istatistikleri',
    schema: {
      type: 'object',
      properties: {
        overview: {
          type: 'object',
          properties: {
            totalProducts: { type: 'number' },
            activeProducts: { type: 'number' },
            totalViews: { type: 'number' },
            totalLikes: { type: 'number' },
            totalSales: { type: 'number' },
            totalRevenue: { type: 'number' },
            totalCollections: { type: 'number' },
            collectionViews: { type: 'number' },
            collectionLikes: { type: 'number' },
          },
        },
        weekly: {
          type: 'object',
          properties: {
            views: { type: 'number' },
            likes: { type: 'number' },
          },
        },
        topProducts: {
          type: 'object',
          properties: {
            byViews: { type: 'array', items: { type: 'object' } },
            byLikes: { type: 'array', items: { type: 'object' } },
          },
        },
        topCollections: { type: 'array', items: { type: 'object' } },
        company: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'İşletme hesabı değil' })
  async getBusinessDashboardStats(@CurrentUser('id') userId: string) {
    return this.userService.getBusinessDashboardStats(userId);
  }

  /**
   * GET /users/top-collections
   * Get top collections from premium users (public)
   */
  @Get('top-collections')
  @Public()
  async getTopCollections(@Query('limit') limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 20;
      return await this.userService.getTopCollections(limitNum);
    } catch (err) {
      this.logger.warn(`getTopCollections failed: ${err?.message || err}`);
      return [];
    }
  }

  /**
   * GET /users/featured-collector
   * Get featured collector of the week (public)
   */
  @Get('featured-collector')
  @Public()
  @ApiOperation({ 
    summary: 'Haftanın koleksiyoneri',
    description: 'En çok görüntülenen ve beğenilen koleksiyonun sahibini döner.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Haftanın koleksiyoneri',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        coverImageUrl: { type: 'string' },
        viewCount: { type: 'number' },
        likeCount: { type: 'number' },
        itemCount: { type: 'number' },
        user: { type: 'object' },
        items: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async getFeaturedCollector() {
    try {
      return await this.userService.getFeaturedCollector();
    } catch (err) {
      this.logger.warn(`getFeaturedCollector failed: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * GET /users/featured-business
   * Get featured business of the week (public)
   */
  @Get('featured-business')
  @Public()
  @ApiOperation({ 
    summary: 'Haftanın şirketi',
    description: 'En popüler işletme hesabını ve koleksiyonlarını döner.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Haftanın şirketi',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        displayName: { type: 'string' },
        companyName: { type: 'string' },
        avatarUrl: { type: 'string' },
        bio: { type: 'string' },
        isVerified: { type: 'boolean' },
        stats: { type: 'object' },
        collections: { type: 'array', items: { type: 'object' } },
        products: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async getFeaturedBusiness() {
    try {
      return await this.userService.getFeaturedBusiness();
    } catch (err) {
      this.logger.warn(`getFeaturedBusiness failed: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * GET /users/top-sellers
   * Get top sellers (public)
   */
  @Get('top-sellers')
  @Public()
  @ApiOperation({ summary: 'En iyi satıcılar' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit (default: 5)' })
  @ApiResponse({ status: 200, description: 'En iyi satıcılar listesi' })
  async getTopSellers(@Query('limit') limit?: string) {
    return this.userService.getTopSellers(limit ? parseInt(limit, 10) : 5);
  }

  /**
   * GET /users/search?q=...
   * İsimle satıcı arama (autocomplete). Herkese açık.
   */
  @Get('search')
  @Public()
  @ApiOperation({ summary: 'İsimle satıcı arama' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit (default: 8)' })
  async searchSellers(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userService.searchSellers(q ?? '', limit ? parseInt(limit, 10) : 8);
  }

  // -------- Seller Bank Account --------

  @Get('me/bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Banka hesap bilgilerini getir' })
  @ApiResponse({ status: 200, description: 'Banka hesabı bilgileri' })
  async getBankAccount(@CurrentUser('id') userId: string) {
    return this.userService.getBankAccount(userId);
  }

  @Patch('me/bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Banka hesap bilgilerini ekle/güncelle' })
  @ApiResponse({ status: 200, description: 'Banka hesabı güncellendi' })
  async upsertBankAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertBankAccountDto,
  ) {
    return this.userService.upsertBankAccount(userId, dto);
  }

  @Delete('me/bank-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Banka hesap bilgilerini sil' })
  @ApiResponse({ status: 200, description: 'Banka hesabı silindi' })
  async deleteBankAccount(@CurrentUser('id') userId: string) {
    return this.userService.deleteBankAccount(userId);
  }
}
