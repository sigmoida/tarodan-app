import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { SIGN_IN_METHODS_ERROR_CODES } from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { getRequestClientInfo } from "../../common/context/request-context";
import { NotificationService } from "../notification/notification.service";
import { SecurityService } from "../security/security.service";
import { i18nMessage } from "../i18n";
import { DUMMY_BCRYPT_HASH } from "./utils/timing-pad";

/** bcrypt cost of a new password (reset and set use the same). */
const PASSWORD_HASH_ROUNDS = 12;

/** Security log event types written here (admin system logs label them). */
export const PASSWORD_SECURITY_EVENTS = {
  set: "password_set",
} as const;

/**
 * Password writes of the auth module: the reset (one-time token: issue, send,
 * consume) and setting a first password while signed in (`setPassword`).
 * Changing an existing password stays in `SecurityService.changePassword`.
 *
 * Both ends of the reset live in one service because the contract between
 * them is implied, not written: how the token is made, how long it lives and
 * what consuming it does. If issuer and consumer lived apart, an expired or
 * already used token still being accepted would be a drift nobody notices.
 */
@Injectable()
export class AuthPasswordService {
  private readonly logger = new Logger(AuthPasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly securityService: SecurityService,
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
    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);

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
    // Push token'ları da aynı anda düşer: kapanan oturumların cihazları
    // bildirim almaya devam etmesin (tek kaynak: SecurityService).
    await this.securityService.revokeAllUserTokens(resetToken.userId);

    // #224: başarı mesajı AuthController.resetPassword() tarafından locale'e göre
    // kuruluyor (server.auth.passwordResetSuccess).
  }

  /**
   * Sets the first password of a signed-in account that has none (a Google
   * or Apple account). The route requires a step-up (`@RequireReauth`).
   *
   * The decision ("no password yet?") and the write run in one transaction
   * under the user row lock, so two concurrent calls set it once and the
   * second answers 409. The bcrypt hash is computed before the transaction:
   * nothing slow runs while the row is locked.
   *
   * Sessions stay: the owner just proved it is them, and a password change
   * does not end other sessions either. The notice mail goes out after
   * commit and never fails the request.
   */
  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
    const { ipAddress, userAgent } = getRequestClientInfo();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, deletedAt: true },
      });
      if (!user || user.deletedAt) {
        throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
      }
      if (user.passwordHash) {
        throw new ConflictException({
          ...i18nMessage("server.auth.passwordAlreadySet"),
          errorCode: SIGN_IN_METHODS_ERROR_CODES.passwordAlreadySet,
        });
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.securityLog.create({
        data: {
          eventType: PASSWORD_SECURITY_EVENTS.set,
          severity: "low",
          userId,
          ipAddress,
          userAgent,
          details: { flow: "password_set" },
        },
      });
    });

    // Fire and forget: the notifier queues the mail and never throws.
    void this.notificationService.sendAccountSecurityNotice(
      userId,
      "passwordSet",
    );
  }
}
