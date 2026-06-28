import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, AdminAuthResponseDto, RefreshTokenDto, TokensDto } from './dto';
import { AdminAuthGuard, JwtRefreshGuard } from './guards';
import { CurrentUser, Public, AdminRoute } from './decorators';
import { RequestUser } from './interfaces';
import { setAuthCookies, clearAuthCookies } from './utils/auth-cookies';

@ApiTags('admin')
@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/admin/login
   * Admin login (separate authentication as defined in project.md)
   */
  @Post('login')
  @Public()
  // Brute-force koruması: IP başına dakikada 5 deneme (web login ile aynı).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin girişi' })
  @ApiResponse({
    status: 200,
    description: 'Admin giriş başarılı',
    type: AdminAuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Email veya şifre hatalı' })
  async adminLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.adminLogin(dto);
    // Tarayıcı için httpOnly admin cookie'leri set et (admin_token / admin_refresh_token).
    if (result?.tokens) {
      setAuthCookies(res, result.tokens, { admin: true });
    }
    return result;
  }

  /**
   * POST /auth/admin/refresh
   * Admin token yenileme (admin_refresh_token cookie'si ile). Ayrı uçtan gidilir ki
   * aynı tarayıcıda kullanıcı oturumu da varken doğru (admin) cookie yenilensin.
   */
  @Post('refresh')
  @Public()
  // Oturum yenileme brute-force hedefi değil (geçerli admin_refresh_token gerekir);
  // SPA açılışta çağırır → global rate-limit'e takılıp 429 dönmemeli (login↔dashboard
  // loop'unun sebebiydi).
  @SkipThrottle()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin token yenileme' })
  @ApiResponse({ status: 200, description: 'Token yenilendi', type: TokensDto })
  @ApiResponse({ status: 401, description: 'Geçersiz refresh token' })
  async adminRefresh(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() user: RequestUser & { refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokensDto> {
    const tokens = await this.authService.refreshTokens(user.id, user.refreshToken, {
      isAdmin: true,
    });
    setAuthCookies(res, tokens, { admin: true });
    return tokens;
  }

  /**
   * GET /auth/admin/profile
   * Get admin profile
   */
  @Get('profile')
  // Oturum doğrulama ucu: admin paneli HER açılışta çağırır → global rate-limit'e
  // takılıp 429 dönmemeli (admin login↔dashboard loop'unun ASIL sebebiydi). Admin
  // JWT korumalı; brute-force hedefi değil.
  @SkipThrottle()
  // @AdminRoute: global JwtAuthGuard'ı atla (o normal access_token cookie'sini ister;
  // admin oturumunda yalnızca admin_token var → aksi halde "Oturum açmanız gerekiyor" 401).
  // Gerçek doğrulamayı AdminAuthGuard (admin-jwt / admin_token) yapar.
  @AdminRoute()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin profili' })
  @ApiResponse({ status: 200, description: 'Admin profil bilgileri' })
  @ApiResponse({ status: 401, description: 'Admin yetkisi gerekiyor' })
  async getAdminProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  /**
   * POST /auth/admin/logout
   * Admin logout
   *
   * Public: süresi dolmuş/geçersiz token'a sahip bir istemci de oturumunu kapatıp
   * cookie'lerini temizleyebilmeli. Guard'lıyken ölü admin_token 401 alıp
   * clearAuthCookies'e hiç ulaşmıyordu → bayat httpOnly cookie tarayıcıda kalıyor ve
   * login↔dashboard döngüsüne yol açıyordu. logout() zaten userId kullanmayan no-op.
   */
  @Post('logout')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin çıkış' })
  @ApiResponse({ status: 200, description: 'Çıkış yapıldı' })
  async adminLogout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res, { admin: true });
    return this.authService.logout('');
  }
}
