import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { type Locale } from "@tarodan/i18n";
import { AuthService } from "./auth.service";
import { PhoneVerificationService } from "./phone-verification.service";
import { EmailChangeService } from "./email-change.service";
import { I18nService, ReqLocale } from "../i18n";
import {
  RegisterDto,
  BusinessRegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  TwoFactorChallengeDto,
  TokensDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  GoogleAuthDto,
  CheckEmailDto,
  AppleAuthDto,
  SendPhoneCodeDto,
  VerifyPhoneDto,
  RequestEmailChangeDto,
  VerifyEmailChangeDto,
} from "./dto";
import { JwtAuthGuard, JwtRefreshGuard } from "./guards";
import { Public, CurrentUser } from "./decorators";
import { RequestUser } from "./interfaces";
import {
  setAuthCookies,
  clearAuthCookies,
  readCookie,
  COOKIE_NAMES,
} from "./utils/auth-cookies";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly phoneVerificationService: PhoneVerificationService,
    private readonly emailChangeService: EmailChangeService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * POST /auth/register
   * Register a new user account
   */
  @Post("register")
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Yeni kullanıcı kaydı" })
  @ApiResponse({
    status: 201,
    description: "Kayıt başarılı",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: "Geçersiz veri" })
  @ApiResponse({ status: 409, description: "Email zaten kayıtlı" })
  async register(
    @Body() dto: RegisterDto,
    @ReqLocale() locale: Locale,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.register(dto);
    return {
      ...result,
      message: this.i18n.translate("server.auth.registerSuccess", locale),
    };
  }

  /**
   * POST /auth/register/business
   * Register a new business account
   */
  @Post("register/business")
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Yeni şirket hesabı kaydı" })
  @ApiResponse({
    status: 201,
    description: "Şirket hesabı kaydı başarılı",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: "Geçersiz veri" })
  @ApiResponse({
    status: 409,
    description: "Email, telefon veya vergi kimlik numarası zaten kayıtlı",
  })
  async registerBusiness(
    @Body() dto: BusinessRegisterDto,
    @ReqLocale() locale: Locale,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.registerBusiness(dto);
    return {
      ...result,
      message: this.i18n.translate(
        "server.auth.businessRegisterSuccess",
        locale,
      ),
    };
  }

  /**
   * POST /auth/login
   * Login with email and password
   */
  @Post("login")
  @Public()
  // Brute-force koruması: IP başına dakikada 5 deneme
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Kullanıcı girişi" })
  @ApiResponse({
    status: 200,
    description: "Giriş başarılı",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: "Email veya şifre hatalı" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto | TwoFactorChallengeDto> {
    const result = await this.authService.login(dto);
    // Tarayıcı için httpOnly cookie; mobil yine body'deki token'ı kullanır.
    if ("tokens" in result) {
      setAuthCookies(res, result.tokens, { admin: false });
    }
    return result;
  }

  /**
   * POST /auth/google — Google id_token ile giriş/kayıt
   */
  /**
   * POST /auth/check-email — identifier-first: e-posta sistemde var mı?
   */
  @Post("check-email")
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async checkEmail(
    @Body() dto: CheckEmailDto,
  ): Promise<{ exists: boolean; hasPassword: boolean }> {
    return this.authService.checkEmail(dto.email);
  }

  @Post("google")
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async google(
    @Body() dto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.loginWithGoogle({
      idToken: dto.idToken,
      code: dto.code,
    });
    // Tarayıcı için httpOnly cookie; mobil yine body'deki token'ı kullanır.
    if (result?.tokens) {
      setAuthCookies(res, result.tokens, { admin: false });
    }
    return result;
  }

  /**
   * POST /auth/apple — Apple identity token ile giriş/kayıt
   */
  @Post("apple")
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async apple(
    @Body() dto: AppleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.loginWithApple(
      dto.identityToken,
      dto.fullName,
    );
    if (result?.tokens) {
      setAuthCookies(res, result.tokens, { admin: false });
    }
    return result;
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  @Post("refresh")
  @Public()
  // Refresh doğrulaması DB'de persisted token hash'ine dokunur. SPA kullanımını
  // engellemeyecek kadar geniş, invalid-token abuse'unu sınırlayacak kadar sonlu.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Token yenileme" })
  @ApiResponse({
    status: 200,
    description: "Token yenilendi",
    type: TokensDto,
  })
  @ApiResponse({ status: 401, description: "Geçersiz refresh token" })
  async refreshTokens(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() user: RequestUser & { refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokensDto> {
    const isAdmin = !!user.isAdmin;
    const tokens = await this.authService.refreshTokens(
      user.id,
      user.refreshToken,
      {
        isAdmin,
        adminSessionToken: user.sessionToken,
      },
    );
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
  @Post("logout")
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Çıkış yap" })
  @ApiResponse({ status: 200, description: "Çıkış yapıldı" })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ReqLocale() locale: Locale,
    @Body() body?: { refreshToken?: string },
  ) {
    clearAuthCookies(res, { admin: false });
    // Web httpOnly cookie'den, mobil body'den gönderir → ikisini de dene ve iptal et.
    const refreshToken =
      readCookie(req, [COOKIE_NAMES.user.refresh]) || body?.refreshToken;
    await this.authService.logout(refreshToken);
    return { message: this.i18n.translate("server.auth.loggedOut", locale) };
  }

  /**
   * GET /auth/profile
   * Get current user profile
   */
  @Get("profile")
  // Oturum doğrulama ucu: SPA her açılışta çağırır, JWT korumalı (brute-force
  // hedefi değil) → global rate-limit'e takılıp 429 dönmemeli (login loop sebebi).
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Kullanıcı profili" })
  @ApiResponse({ status: 200, description: "Profil bilgileri" })
  @ApiResponse({ status: 401, description: "Yetkilendirme hatası" })
  async getProfile(@CurrentUser("id") userId: string) {
    return this.authService.getProfile(userId);
  }

  /**
   * POST /auth/forgot-password
   * Request password reset
   */
  @Post("forgot-password")
  @Public()
  // E-posta gönderdiği için daha sıkı: IP başına dakikada 3
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Şifre sıfırlama isteği" })
  @ApiResponse({ status: 200, description: "Şifre sıfırlama linki gönderildi" })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @ReqLocale() locale: Locale,
  ) {
    await this.authService.requestPasswordReset(dto.email);
    return {
      message: this.i18n.translate("server.auth.passwordResetLinkSent", locale),
    };
  }

  /**
   * POST /auth/reset-password
   * Reset password with token
   */
  @Post("reset-password")
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Şifre sıfırla" })
  @ApiResponse({ status: 200, description: "Şifre başarıyla sıfırlandı" })
  @ApiResponse({ status: 400, description: "Geçersiz token" })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @ReqLocale() locale: Locale,
  ) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return {
      message: this.i18n.translate("server.auth.passwordResetSuccess", locale),
    };
  }

  /**
   * POST /auth/verify-email
   * Verify email with token
   */
  @Post("verify-email")
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "E-posta doğrulama" })
  @ApiResponse({ status: 200, description: "E-posta başarıyla doğrulandı" })
  @ApiResponse({
    status: 400,
    description: "Geçersiz veya süresi dolmuş token",
  })
  async verifyEmail(
    @Body() body: { token: string },
    @ReqLocale() locale: Locale,
  ) {
    const result = await this.authService.verifyEmail(body.token);
    return {
      message: this.i18n.translate(
        result.alreadyVerified
          ? "server.auth.emailVerificationAlreadyDone"
          : "server.auth.emailVerificationSuccess",
        locale,
      ),
    };
  }

  /**
   * POST /auth/phone/send-code
   * Kullanıcının telefonuna doğrulama kodu gönderir.
   */
  @Post("phone/send-code")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: "Telefon doğrulama kodu gönder" })
  async sendPhoneCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: SendPhoneCodeDto,
    @ReqLocale() locale: Locale,
  ): Promise<{ message: string }> {
    await this.phoneVerificationService.sendCode(user.id, dto.phone);
    return {
      message: this.i18n.translate(
        "server.auth.phoneVerificationCodeSent",
        locale,
      ),
    };
  }

  /**
   * POST /auth/phone/verify
   * Gönderilen kodu doğrular.
   */
  @Post("phone/verify")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Telefon doğrulama kodunu doğrula" })
  async verifyPhone(
    @CurrentUser() user: RequestUser,
    @Body() dto: VerifyPhoneDto,
    @ReqLocale() locale: Locale,
  ): Promise<{ message: string; isPhoneVerified: boolean }> {
    const result = await this.phoneVerificationService.verify(
      user.id,
      dto.code,
    );
    return {
      message: this.i18n.translate(
        "server.auth.phoneVerificationSuccess",
        locale,
      ),
      isPhoneVerified: result.isPhoneVerified,
    };
  }

  /**
   * POST /auth/email/request-change
   * Kullanıcının e-postasını değiştirmek için YENİ adrese aktivasyon kodu gönderir.
   * Mevcut e-posta doğrulanana kadar aktif kalır.
   */
  @Post("email/request-change")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: "E-posta değişikliği kodu gönder" })
  async requestEmailChange(
    @CurrentUser() user: RequestUser,
    @Body() dto: RequestEmailChangeDto,
    @ReqLocale() locale: Locale,
  ): Promise<{ message: string }> {
    await this.emailChangeService.requestChange(user.id, dto.newEmail);
    return {
      message: this.i18n.translate("server.auth.emailChangeCodeSent", locale),
    };
  }

  /**
   * POST /auth/email/verify-change
   * Aktivasyon kodunu doğrular ve e-postayı yeni adresle değiştirir.
   */
  @Post("email/verify-change")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "E-posta değişikliği kodunu doğrula" })
  async verifyEmailChange(
    @CurrentUser() user: RequestUser,
    @Body() dto: VerifyEmailChangeDto,
    @ReqLocale() locale: Locale,
  ): Promise<{ message: string; email: string }> {
    const result = await this.emailChangeService.verify(user.id, dto.code);
    return {
      message: this.i18n.translate("server.auth.emailChangeSuccess", locale),
      email: result.email,
    };
  }

  /**
   * POST /auth/resend-verification
   * Resend email verification link
   */
  @Post("resend-verification")
  @Public()
  // E-posta gönderdiği için daha sıkı: IP başına dakikada 3
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Doğrulama e-postasını tekrar gönder" })
  @ApiResponse({ status: 200, description: "Doğrulama e-postası gönderildi" })
  @ApiResponse({ status: 400, description: "E-posta zaten doğrulanmış" })
  async resendVerification(
    @Body() body: { email: string },
    @ReqLocale() locale: Locale,
  ) {
    // Find user by email
    const user = await this.authService.findUserByEmail(body.email);
    if (!user) {
      // Don't reveal if user exists for security
      return {
        message: this.i18n.translate(
          "server.auth.resendVerificationGeneric",
          locale,
        ),
      };
    }
    await this.authService.resendEmailVerification(user.id);
    return {
      message: this.i18n.translate(
        "server.auth.verificationEmailResent",
        locale,
      ),
    };
  }
}
