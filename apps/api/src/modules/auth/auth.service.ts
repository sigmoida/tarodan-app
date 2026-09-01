import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  RegisterDto,
  BusinessRegisterDto,
  CorporateInvitationDto,
  LoginDto,
  AuthResponseDto,
  RegisterResponseDto,
  TwoFactorChallengeDto,
} from "./dto";
import { AuthTokenService } from "./auth-token.service";
import {
  AuthRegistrationService,
  type EmailVerificationSendResult,
} from "./auth-registration.service";
import { AuthPasswordService } from "./auth-password.service";
import { AuthLoginService } from "./auth-login.service";
import { SocialLoginService } from "./social/social-login.service";
import { i18nMessage } from "../i18n";

/**
 * Auth modülünün ön yüzü. Çağıranların bildiği imzaları koruyup gövdeyi tek
 * işli servislere devreder: oturum jetonları (tokens), hesap açılışı
 * (registration), şifreyle giriş (logins), şifre sıfırlama (passwords) ve
 * sosyal giriş (socialLogins). Kendi tuttuğu tek şey iki profil okuması.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly registration: AuthRegistrationService,
    private readonly passwords: AuthPasswordService,
    private readonly logins: AuthLoginService,
    private readonly socialLogins: SocialLoginService,
  ) {}

  // ────────────────────────── oturum jetonları ──────────────────────────
  // Controller ve admin oturumu bu servisi adresliyor; gövde
  // AuthTokenService'te.

  refreshTokens(...args: Parameters<AuthTokenService["refreshTokens"]>) {
    return this.tokens.refreshTokens(...args);
  }

  logout(...args: Parameters<AuthTokenService["logout"]>) {
    return this.tokens.logout(...args);
  }

  // ───────────────────────────── hesap açılışı ─────────────────────────────
  // Controller ve kurumsal davet akışı bu servisi adresliyor; gövde
  // AuthRegistrationService'te.

  isUsernameAvailable(value: string): Promise<boolean> {
    return this.registration.isUsernameAvailable(value);
  }

  register(dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.registration.register(dto);
  }

  sendEmailVerification(
    userId: string,
    email: string,
  ): Promise<EmailVerificationSendResult> {
    return this.registration.sendEmailVerification(userId, email);
  }

  verifyEmail(token: string): Promise<{ alreadyVerified: boolean }> {
    return this.registration.verifyEmail(token);
  }

  resendEmailVerification(
    userId: string,
  ): Promise<EmailVerificationSendResult> {
    return this.registration.resendEmailVerification(userId);
  }

  /** Aktivasyon mailini kuyruğa alır — toplu admin gönderiminin yolu. */
  queueEmailVerification(userId: string): Promise<void> {
    return this.registration.queueEmailVerification(userId);
  }

  registerBusiness(dto: BusinessRegisterDto) {
    return this.registration.registerBusiness(dto);
  }

  getCorporateInvitation(token: string) {
    return this.registration.getCorporateInvitation(token);
  }

  activateCorporateInvitation(dto: CorporateInvitationDto) {
    return this.registration.activateCorporateInvitation(dto);
  }

  // ─────────────────────────── şifreyle giriş ───────────────────────────
  // Controller ve admin paneli bu servisi adresliyor; gövde
  // AuthLoginService'te.

  login(dto: LoginDto): Promise<AuthResponseDto | TwoFactorChallengeDto> {
    return this.logins.login(dto);
  }

  adminLogin(...args: Parameters<AuthLoginService["adminLogin"]>) {
    return this.logins.adminLogin(...args);
  }

  checkEmail(...args: Parameters<AuthLoginService["checkEmail"]>) {
    return this.logins.checkEmail(...args);
  }

  /**
   * Find user by email (for resend verification)
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isEmailVerified: true },
    });
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminUser: true },
    });

    if (!user) {
      throw new BadRequestException(i18nMessage("server.auth.userNotFound"));
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      isVerified: user.isVerified,
      isPhoneVerified: user.isPhoneVerified,
      isSeller: user.isSeller,
      sellerType: user.sellerType,
      isAdmin: !!user.adminUser?.isActive,
      role: user.adminUser?.role,
      createdAt: user.createdAt,
      preferredLanguage: user.preferredLanguage,
      homeTourVersion: user.homeTourVersion,
      listingTourVersion: user.listingTourVersion,
    };
  }

  // ────────────────────────── şifre sıfırlama ──────────────────────────
  // Controller bu servisi adresliyor; gövde AuthPasswordService'te.

  requestPasswordReset(email: string): Promise<void> {
    return this.passwords.requestPasswordReset(email);
  }

  resetPassword(token: string, newPassword: string): Promise<void> {
    return this.passwords.resetPassword(token, newPassword);
  }

  // ────────────────────────── sosyal giriş ──────────────────────────
  // Controller bu servisi adresliyor; gövde SocialLoginService'te.

  loginWithGoogle(...args: Parameters<SocialLoginService["loginWithGoogle"]>) {
    return this.socialLogins.loginWithGoogle(...args);
  }

  loginWithApple(...args: Parameters<SocialLoginService["loginWithApple"]>) {
    return this.socialLogins.loginWithApple(...args);
  }
}
