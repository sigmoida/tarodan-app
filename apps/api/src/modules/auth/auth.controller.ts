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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  BusinessRegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  TokensDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { JwtAuthGuard, JwtRefreshGuard } from './guards';
import { Public, CurrentUser } from './decorators';
import { RequestUser } from './interfaces';
import { setAuthCookies, clearAuthCookies } from './utils/auth-cookies';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Register a new user account
   */
  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Yeni kullanıcı kaydı' })
  @ApiResponse({
    status: 201,
    description: 'Kayıt başarılı',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Geçersiz veri' })
  @ApiResponse({ status: 409, description: 'Email zaten kayıtlı' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/register/business
   * Register a new business account
   */
  @Post('register/business')
  @Public()
  @ApiOperation({ summary: 'Yeni şirket hesabı kaydı' })
  @ApiResponse({
    status: 201,
    description: 'Şirket hesabı kaydı başarılı',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Geçersiz veri' })
  @ApiResponse({ status: 409, description: 'Email, telefon veya vergi kimlik numarası zaten kayıtlı' })
  async registerBusiness(@Body() dto: BusinessRegisterDto): Promise<AuthResponseDto> {
    return this.authService.registerBusiness(dto);
  }

  /**
   * POST /auth/login
   * Login with email and password
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kullanıcı girişi' })
  @ApiResponse({
    status: 200,
    description: 'Giriş başarılı',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Email veya şifre hatalı' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto);
    // Tarayıcı için httpOnly cookie; mobil yine body'deki token'ı kullanır.
    if (result?.tokens) {
      setAuthCookies(res, result.tokens, { admin: false });
    }
    return result;
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  @Post('refresh')
  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token yenileme' })
  @ApiResponse({
    status: 200,
    description: 'Token yenilendi',
    type: TokensDto,
  })
  @ApiResponse({ status: 401, description: 'Geçersiz refresh token' })
  async refreshTokens(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() user: RequestUser & { refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokensDto> {
    const isAdmin = !!user.isAdmin;
    const tokens = await this.authService.refreshTokens(user.id, user.refreshToken, {
      isAdmin,
    });
    // Rotasyonla gelen yeni token'ları doğru cookie setine yaz (admin/normal).
    setAuthCookies(res, tokens, { admin: isAdmin });
    return tokens;
  }

  /**
   * POST /auth/logout
   * Logout current user
   *
   * Public: süresi dolmuş/geçersiz token'a sahip istemci de cookie'lerini
   * temizleyebilmeli. Guard'lıyken ölü access_token 401 alıp clearAuthCookies'e hiç
   * ulaşmıyordu → bayat httpOnly cookie tarayıcıda kalıyordu. logout() userId kullanmaz.
   */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Çıkış yap' })
  @ApiResponse({ status: 200, description: 'Çıkış yapıldı' })
  async logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res, { admin: false });
    return this.authService.logout('');
  }

  /**
   * GET /auth/profile
   * Get current user profile
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kullanıcı profili' })
  @ApiResponse({ status: 200, description: 'Profil bilgileri' })
  @ApiResponse({ status: 401, description: 'Yetkilendirme hatası' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  /**
   * POST /auth/forgot-password
   * Request password reset
   */
  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Şifre sıfırlama isteği' })
  @ApiResponse({ status: 200, description: 'Şifre sıfırlama linki gönderildi' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  /**
   * POST /auth/reset-password
   * Reset password with token
   */
  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Şifre sıfırla' })
  @ApiResponse({ status: 200, description: 'Şifre başarıyla sıfırlandı' })
  @ApiResponse({ status: 400, description: 'Geçersiz token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * POST /auth/verify-email
   * Verify email with token
   */
  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'E-posta doğrulama' })
  @ApiResponse({ status: 200, description: 'E-posta başarıyla doğrulandı' })
  @ApiResponse({ status: 400, description: 'Geçersiz veya süresi dolmuş token' })
  async verifyEmail(@Body() body: { token: string }) {
    return this.authService.verifyEmail(body.token);
  }

  /**
   * POST /auth/resend-verification
   * Resend email verification link
   */
  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Doğrulama e-postasını tekrar gönder' })
  @ApiResponse({ status: 200, description: 'Doğrulama e-postası gönderildi' })
  @ApiResponse({ status: 400, description: 'E-posta zaten doğrulanmış' })
  async resendVerification(@Body() body: { email: string }) {
    // Find user by email
    const user = await this.authService.findUserByEmail(body.email);
    if (!user) {
      // Don't reveal if user exists for security
      return { message: 'Eğer bu email kayıtlıysa, doğrulama linki gönderildi' };
    }
    return this.authService.resendEmailVerification(user.id);
  }
}
