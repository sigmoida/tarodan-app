import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma";
import { NotificationService } from "../notification/notification.service";
import { i18nMessage } from "../i18n";
import { DUMMY_BCRYPT_HASH } from "./utils/timing-pad";

/**
 * Şifre sıfırlama: tek kullanımlık token'ın üretimi, gönderimi ve tüketimi.
 * AuthService'ten birebir taşındı.
 *
 * İki uç tek serviste duruyor çünkü aradaki sözleşme yazılı değil, ima
 * edilmiş: token'ın nasıl üretildiği, ne kadar yaşadığı ve tüketildiğinde ne
 * olduğu. Üreten ve tüketen ayrı yerlerde yaşarsa süresi geçmiş ya da bir kez
 * kullanılmış bir token'ın hâlâ kabul edilmesi kimsenin fark etmeyeceği bir
 * sapma olur.
 */
@Injectable()
export class AuthPasswordService {
  private readonly logger = new Logger(AuthPasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Request password reset
   * POST /auth/forgot-password
   */
  async requestPasswordReset(email: string): Promise<void> {
    // Silinmiş (anonimleştirilmiş) ya da banlı hesaba reset linki gönderme:
    // findUnique yerine deletedAt:null + banlı filtresi. Yanıt her durumda aynı
    // (enumeration'a karşı) — sadece link üretimini/gönderimini atlarız.
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, isBanned: false },
    });

    // Don't reveal if user exists for security
    // #224: yanıt mesajı AuthController.forgotPassword() tarafından locale'e göre
    // kuruluyor (server.auth.passwordResetLinkSent) — kullanıcı bulunsun bulunmasın aynı.
    if (!user) {
      // Dummy bcrypt compare (same technique as login()/adminLogin()) so a
      // "no such account" response takes roughly the same time as the real
      // path's deleteMany+create+email-send below — the response body is
      // already identical either way (#224), but without this the latency gap
      // alone enumerates registered emails. A DB read against the
      // non-existent key doesn't work here: it's cheap regardless (userId
      // isn't even indexed on this table), and a matching dummy WRITE isn't
      // possible — PasswordResetToken.userId has a real FK constraint, so
      // there's no id we could insert against.
      await bcrypt.compare(email, DUMMY_BCRYPT_HASH);
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Delete existing tokens for this user
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new token
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Don't await email delivery — the network round-trip to the email
    // provider is by far the dominant, most variable cost on this path;
    // awaiting it would leak account existence through response timing far
    // more than the DB work above does.
    void this.notificationService
      .sendPasswordResetEmail(user.id, resetToken)
      .catch((error) =>
        this.logger.error(`Failed to send password reset email: ${error}`),
      );
  }

  /**
   * Reset password with token
   * POST /auth/reset-password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Hash the token to compare
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find token
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenInvalidOrExpired"),
      );
    }

    if (resetToken.usedAt) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenAlreadyUsed"),
      );
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenExpired"),
      );
    }

    // Silinmiş/banlı hesap için token geçerli olsa bile parola set etme.
    if (resetToken.user.deletedAt || resetToken.user.isBanned) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenInvalidOrExpired"),
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user password
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    // Mark token as used
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // Parola değişti → mevcut tüm refresh token'ları (session'ları) iptal et.
    // Bir hesap kurtarma/ele geçirme savunmasının parçasıysa, eski oturumlar
    // (ör. saldırgan) anında düşer; kullanıcı yeniden giriş yapar.
    await this.prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // #224: başarı mesajı AuthController.resetPassword() tarafından locale'e göre
    // kuruluyor (server.auth.passwordResetSuccess).
  }
}
