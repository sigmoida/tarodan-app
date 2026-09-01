import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import * as QRCode from "qrcode";
import {
  Enable2FAResponseDto,
  TwoFactorStatusDto,
  CsrfTokenResponseDto,
  AdminSessionDto,
  AdminSessionListDto,
} from "./dto";
import { generateTotpSecret, verifyTotpCode } from "./totp.util";
import { i18nMessage } from "../i18n";

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly SECRET_BYTES = 20;
  private readonly TOKEN_EXPIRY_HOURS = 24;
  private readonly ADMIN_SESSION_TIMEOUT_MINUTES = 30;
  private readonly CSRF_TOKEN_EXPIRY_MINUTES = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ==========================================================================
  // GAP-004: TWO-FACTOR AUTHENTICATION (TOTP)
  // ==========================================================================

  /**
   * Generate TOTP secret for 2FA setup
   */
  async enable2FA(userId: string): Promise<Enable2FAResponseDto> {
    // Check if already has 2FA
    const existing = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });

    if (existing?.isEnabled) {
      throw new BadRequestException("2FA zaten etkin");
    }

    // Generate secret
    const secret = this.generateTOTPSecret();
    const backupCodes = this.generateBackupCodes();

    // Get user info for QR code label
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    if (!user?.passwordHash) {
      throw new BadRequestException(
        i18nMessage("server.security.passwordRequiredFor2fa"),
      );
    }

    // Sağlama URI'si (otpauth) — kimlik doğrulayıcı uygulamasına verilen
    // bağlantı. Bir GÖRSEL adresi DEĞİL: doğrudan <img src> içine konulamaz.
    const issuer = "Tarodan";
    const qrCodeUrl = `otpauth://totp/${issuer}:${user?.email}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    // Taranabilir görsel sunucuda üretilir: her istemci (web + mobil) aynı
    // görseli alsın, her biri ayrı bir QR kütüphanesi taşımasın.
    const qrCodeImage = await QRCode.toDataURL(qrCodeUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });

    // Store encrypted secret
    const encryptedSecret = this.encryptSecret(secret);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );

    if (existing) {
      await this.prisma.twoFactorSecret.update({
        where: { userId },
        data: {
          secret: encryptedSecret,
          backupCodes: hashedBackupCodes,
          isEnabled: false, // Not enabled until verified
        },
      });
    } else {
      await this.prisma.twoFactorSecret.create({
        data: {
          userId,
          secret: encryptedSecret,
          backupCodes: hashedBackupCodes,
          isEnabled: false,
        },
      });
    }

    return {
      secret,
      qrCodeUrl,
      qrCodeImage,
      backupCodes,
    };
  }

  /**
   * Verify TOTP code and enable 2FA
   */
  async verify2FA(userId: string, code: string): Promise<boolean> {
    const twoFactor = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });

    if (!twoFactor) {
      throw new BadRequestException(
        i18nMessage("server.security.twoFactorNotSetUp"),
      );
    }

    const secret = this.decryptSecret(twoFactor.secret);
    const isValid = this.verifyTOTP(secret, code);

    if (!isValid) {
      throw new UnauthorizedException(
        i18nMessage("server.security.invalidCode"),
      );
    }

    // Enable 2FA
    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: {
        isEnabled: true,
        ...(twoFactor.secret.startsWith("v1:")
          ? {}
          : { secret: this.encryptSecret(secret) }),
      },
    });

    // Update admin user if exists
    await this.prisma.adminUser.updateMany({
      where: { userId },
      data: { twoFactorEnabled: true },
    });

    return true;
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId: string, code: string): Promise<boolean> {
    const twoFactor = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });

    if (!twoFactor || !twoFactor.isEnabled) {
      throw new BadRequestException(
        i18nMessage("server.security.twoFactorDisabled"),
      );
    }

    const secret = this.decryptSecret(twoFactor.secret);
    const isValid = this.verifyTOTP(secret, code);

    if (!isValid) {
      throw new UnauthorizedException(
        i18nMessage("server.security.invalidCode"),
      );
    }

    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: { isEnabled: false },
    });

    await this.prisma.adminUser.updateMany({
      where: { userId },
      data: { twoFactorEnabled: false },
    });

    return true;
  }

  /**
   * Validate TOTP code for login
   */
  async validateTOTP(userId: string, code: string): Promise<boolean> {
    const twoFactor = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });

    if (!twoFactor || !twoFactor.isEnabled) {
      return true; // No 2FA required
    }

    const secret = this.decryptSecret(twoFactor.secret);

    // Check TOTP code
    if (this.verifyTOTP(secret, code)) {
      if (!twoFactor.secret.startsWith("v1:")) {
        await this.prisma.twoFactorSecret.update({
          where: { userId },
          data: { secret: this.encryptSecret(secret) },
        });
      }
      return true;
    }

    // Check backup codes
    for (let i = 0; i < twoFactor.backupCodes.length; i++) {
      const isMatch = await bcrypt.compare(code, twoFactor.backupCodes[i]);
      if (isMatch) {
        // Consume the backup code with compare-and-swap semantics. Two concurrent
        // logins that present the same code cannot both succeed.
        const updatedCodes = [...twoFactor.backupCodes];
        updatedCodes.splice(i, 1);
        const consumed = await this.prisma.twoFactorSecret.updateMany({
          where: {
            userId,
            isEnabled: true,
            backupCodes: { equals: twoFactor.backupCodes },
          },
          data: {
            backupCodes: updatedCodes,
            ...(twoFactor.secret.startsWith("v1:")
              ? {}
              : { secret: this.encryptSecret(secret) }),
          },
        });
        return consumed.count === 1;
      }
    }

    return false;
  }

  /**
   * Get 2FA status
   */
  async get2FAStatus(userId: string): Promise<TwoFactorStatusDto> {
    const twoFactor = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });

    return {
      isEnabled: twoFactor?.isEnabled || false,
      hasBackupCodes: (twoFactor?.backupCodes?.length || 0) > 0,
    };
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string, code: string): Promise<string[]> {
    const twoFactor = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });

    if (!twoFactor || !twoFactor.isEnabled) {
      throw new BadRequestException(
        i18nMessage("server.security.twoFactorDisabled"),
      );
    }

    const secret = this.decryptSecret(twoFactor.secret);
    const isValid = this.verifyTOTP(secret, code);

    if (!isValid) {
      throw new UnauthorizedException(
        i18nMessage("server.security.invalidCode"),
      );
    }

    const newBackupCodes = this.generateBackupCodes();
    const hashedCodes = await Promise.all(
      newBackupCodes.map((c) => bcrypt.hash(c, 10)),
    );

    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: { backupCodes: hashedCodes },
    });

    return newBackupCodes;
  }

  // ==========================================================================
  // GAP-005: PASSWORD RESET
  // ==========================================================================

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Invalidate existing tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRY_HOURS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt,
      },
    });

    // TODO: Send email with reset link
    // In production, integrate with email service
    this.logger.log("Password reset token created");
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!resetToken) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenInvalidOrExpired"),
      );
    }

    if (resetToken.usedAt) {
      throw new BadRequestException(
        i18nMessage("server.security.tokenAlreadyUsed"),
      );
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenExpired"),
      );
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    // Mark token as used
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Change password (logged in user)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }

    // A social sign-in account has no password hash, and bcrypt rejects a null
    // digest — so this used to fail with a 500 instead of an answer. Treated as
    // a failed verification: the same response a wrong password gets, which
    // also avoids disclosing that the account has no password at all.
    const isValid =
      !!user.passwordHash &&
      (await bcrypt.compare(currentPassword, user.passwordHash));
    if (!isValid) {
      throw new UnauthorizedException(
        i18nMessage("server.security.currentPasswordWrong"),
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  // ==========================================================================
  // GAP-009: REFRESH TOKEN PERSISTENCE
  // ==========================================================================

  /**
   * Store refresh token
   */
  async storeRefreshToken(
    userId: string,
    tokenHash: string,
    deviceInfo?: string,
    ipAddress?: string,
    expiresAt?: Date,
  ): Promise<void> {
    const expiry = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        deviceInfo,
        ipAddress,
        expiresAt: expiry,
      },
    });
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(tokenHash: string): Promise<string | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!token) return null;
    if (token.revokedAt) return null;
    if (token.expiresAt < new Date()) return null;

    return token.userId;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoke all user's refresh tokens
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ==========================================================================
  // GAP-017: CSRF PROTECTION
  // ==========================================================================

  /**
   * Generate CSRF token
   */
  async generateCsrfToken(sessionId: string): Promise<CsrfTokenResponseDto> {
    const token = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.CSRF_TOKEN_EXPIRY_MINUTES,
    );

    await this.prisma.csrfToken.create({
      data: {
        token,
        sessionId,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Validate CSRF token
   */
  async validateCsrfToken(token: string, sessionId: string): Promise<boolean> {
    const csrfToken = await this.prisma.csrfToken.findUnique({
      where: { token },
    });

    if (!csrfToken) return false;
    if (csrfToken.sessionId !== sessionId) return false;
    if (csrfToken.expiresAt < new Date()) return false;

    // Delete used token (one-time use)
    await this.prisma.csrfToken.delete({ where: { id: csrfToken.id } });

    return true;
  }

  /**
   * Cleanup expired CSRF tokens
   */
  async cleanupExpiredCsrfTokens(): Promise<number> {
    const result = await this.prisma.csrfToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  // ==========================================================================
  // GAP-018: ADMIN SESSION TIMEOUT
  // ==========================================================================

  /**
   * Create admin session
   */
  async createAdminSession(
    adminUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<string> {
    const sessionToken = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.ADMIN_SESSION_TIMEOUT_MINUTES,
    );

    await this.prisma.adminSession.create({
      data: {
        adminUserId,
        sessionToken,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    return sessionToken;
  }

  /**
   * Validate admin session
   */
  async validateAdminSession(sessionToken: string): Promise<string | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { sessionToken },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) return null;

    // Extend session on activity
    const newExpiresAt = new Date();
    newExpiresAt.setMinutes(
      newExpiresAt.getMinutes() + this.ADMIN_SESSION_TIMEOUT_MINUTES,
    );

    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: {
        lastActiveAt: new Date(),
        expiresAt: newExpiresAt,
      },
    });

    return session.adminUserId;
  }

  /**
   * Get admin sessions
   */
  async getAdminSessions(
    adminUserId: string,
    currentToken?: string,
  ): Promise<AdminSessionListDto> {
    const sessions = await this.prisma.adminSession.findMany({
      where: {
        adminUserId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: "desc" },
    });

    const currentSession = sessions.find(
      (s) => s.sessionToken === currentToken,
    );

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress || undefined,
        userAgent: s.userAgent || undefined,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })),
      currentSessionId: currentSession?.id || "",
    };
  }

  /**
   * Terminate admin session
   */
  async terminateAdminSession(
    sessionId: string,
    adminUserId: string,
  ): Promise<void> {
    await this.prisma.adminSession.deleteMany({
      where: { id: sessionId, adminUserId },
    });
  }

  async terminateAdminSessionByToken(sessionToken: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({
      where: { sessionToken },
    });
  }

  /**
   * Terminate all admin sessions
   */
  async terminateAllAdminSessions(adminUserId: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({
      where: { adminUserId },
    });
  }

  /**
   * Cleanup expired admin sessions
   */
  async cleanupExpiredAdminSessions(): Promise<number> {
    const result = await this.prisma.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private generateTOTPSecret(): string {
    return generateTotpSecret(this.SECRET_BYTES);
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(
        crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase()
          .match(/.{4}/g)
          ?.join("-") || crypto.randomBytes(4).toString("hex").toUpperCase(),
      );
    }
    return codes;
  }

  private encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this.getTwoFactorEncryptionKey(),
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
  }

  private decryptSecret(encrypted: string): string {
    if (!encrypted.startsWith("v1:")) {
      return Buffer.from(encrypted, "base64").toString("utf8");
    }

    const [, iv, tag, ciphertext] = encrypted.split(":");
    if (!iv || !tag || !ciphertext) {
      throw new Error("Invalid encrypted two-factor secret");
    }

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.getTwoFactorEncryptionKey(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  private verifyTOTP(secret: string, code: string): boolean {
    return verifyTotpCode(secret, code);
  }

  private getTwoFactorEncryptionKey(): Buffer {
    const material =
      this.configService.get<string>("TWO_FACTOR_ENCRYPTION_KEY") ||
      this.configService.getOrThrow<string>("JWT_SECRET");
    return crypto.createHash("sha256").update(material).digest();
  }
}
