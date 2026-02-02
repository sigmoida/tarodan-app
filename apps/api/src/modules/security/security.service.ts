import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  Enable2FAResponseDto,
  TwoFactorStatusDto,
  EmailVerificationStatusDto,
  CsrfTokenResponseDto,
  AdminSessionDto,
  AdminSessionListDto,
} from './dto';

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
      throw new BadRequestException('2FA zaten etkin');
    }

    // Generate secret
    const secret = this.generateTOTPSecret();
    const backupCodes = this.generateBackupCodes();

    // Get user info for QR code label
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    // Generate QR code URL (otpauth format)
    const issuer = 'Tarodan';
    const qrCodeUrl = `otpauth://totp/${issuer}:${user?.email}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

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
      throw new BadRequestException('2FA kurulumu yapılmamış');
    }

    const secret = this.decryptSecret(twoFactor.secret);
    const isValid = this.verifyTOTP(secret, code);

    if (!isValid) {
      throw new UnauthorizedException('Geçersiz doğrulama kodu');
    }

    // Enable 2FA
    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: { isEnabled: true },
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
      throw new BadRequestException('2FA etkin değil');
    }

    const secret = this.decryptSecret(twoFactor.secret);
    const isValid = this.verifyTOTP(secret, code);

    if (!isValid) {
      throw new UnauthorizedException('Geçersiz doğrulama kodu');
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
      return true;
    }

    // Check backup codes
    for (let i = 0; i < twoFactor.backupCodes.length; i++) {
      const isMatch = await bcrypt.compare(code, twoFactor.backupCodes[i]);
      if (isMatch) {
        // Remove used backup code
        const updatedCodes = [...twoFactor.backupCodes];
        updatedCodes.splice(i, 1);
        await this.prisma.twoFactorSecret.update({
          where: { userId },
          data: { backupCodes: updatedCodes },
        });
        return true;
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
      throw new BadRequestException('2FA etkin değil');
    }

    const secret = this.decryptSecret(twoFactor.secret);
    const isValid = this.verifyTOTP(secret, code);

    if (!isValid) {
      throw new UnauthorizedException('Geçersiz doğrulama kodu');
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
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

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
    this.logger.log('Password reset token created');
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!resetToken) {
      throw new BadRequestException('Geçersiz veya süresi dolmuş token');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Bu token zaten kullanılmış');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Token süresi dolmuş');
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
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Mevcut şifre yanlış');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  // ==========================================================================
  // GAP-006: EMAIL VERIFICATION
  // ==========================================================================

  /**
   * Send email verification
   */
  async sendEmailVerification(userId: string, email?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const targetEmail = email || user.email;

    // Invalidate existing tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRY_HOURS);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        token,
        email: targetEmail,
        expiresAt,
      },
    });

    // TODO: Send email with verification link
    this.logger.log('Email verification token created');
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      throw new BadRequestException('Geçersiz doğrulama tokeni');
    }

    if (verificationToken.usedAt) {
      throw new BadRequestException('Bu token zaten kullanılmış');
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new BadRequestException('Token süresi dolmuş');
    }

    // Update user
    await this.prisma.user.update({
      where: { id: verificationToken.userId },
      data: {
        isEmailVerified: true,
        email: verificationToken.email,
      },
    });

    // Mark token as used
    await this.prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Get email verification status
   */
  async getEmailVerificationStatus(userId: string): Promise<EmailVerificationStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const pendingToken = await this.prisma.emailVerificationToken.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    });

    return {
      isVerified: user.isEmailVerified,
      email: user.email,
      pendingVerification: !!pendingToken,
    };
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
    const token = crypto.randomBytes(32).toString('hex');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.CSRF_TOKEN_EXPIRY_MINUTES);

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
    const sessionToken = crypto.randomBytes(32).toString('hex');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.ADMIN_SESSION_TIMEOUT_MINUTES);

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
      orderBy: { lastActiveAt: 'desc' },
    });

    const currentSession = sessions.find((s) => s.sessionToken === currentToken);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress || undefined,
        userAgent: s.userAgent || undefined,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })),
      currentSessionId: currentSession?.id || '',
    };
  }

  /**
   * Terminate admin session
   */
  async terminateAdminSession(sessionId: string): Promise<void> {
    await this.prisma.adminSession.delete({
      where: { id: sessionId },
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
    // Generate random bytes and encode to base32 manually
    const bytes = crypto.randomBytes(this.SECRET_BYTES);
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      result += base32Chars[bytes[i] % 32];
    }
    return result.substring(0, 32);
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(
        crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{4}/g)?.join('-') ||
          crypto.randomBytes(4).toString('hex').toUpperCase(),
      );
    }
    return codes;
  }

  private encryptSecret(secret: string): string {
    // In production, use proper encryption with key management
    // For now, using base64 encoding as placeholder
    return Buffer.from(secret).toString('base64');
  }

  private decryptSecret(encrypted: string): string {
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  }

  private verifyTOTP(secret: string, code: string): boolean {
    // Simple TOTP verification (in production, use a proper TOTP library)
    // This is a simplified implementation for demonstration
    const time = Math.floor(Date.now() / 1000 / 30);
    
    // Check current and adjacent time windows
    for (let i = -1; i <= 1; i++) {
      const expectedCode = this.generateTOTPCode(secret, time + i);
      if (expectedCode === code) {
        return true;
      }
    }
    return false;
  }

  private generateTOTPCode(secret: string, time: number): string {
    // Simplified TOTP code generation
    // In production, use speakeasy or otplib library
    // Decode base32 to buffer manually
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const secretBytes: number[] = [];
    for (const char of secret.toUpperCase()) {
      const idx = base32Chars.indexOf(char);
      if (idx >= 0) secretBytes.push(idx);
    }
    const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(time));
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }
}
