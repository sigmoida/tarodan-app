import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AuthService } from "../../auth/auth.service";
import { i18nMessage } from "../../i18n";
import { AdminAuditService } from "../ops/admin-audit.service";
import { AdminStaffService } from "./admin-staff.service";
import { AdminAnalyticsOrderService } from "../analytics/admin-analytics-order.service";
import { BanUserDto } from "../dto";
import { runBulk, type BulkResult } from "../common/run-bulk";
import { UserService } from "../../user/user.service";

/**
 * Hesap aktivasyonu (e-posta doğrulama) admin işlemleri + kullanıcı toplu
 * işlemleri.
 *
 * Aktivasyon maili kayıt akışındaki AYNI token/şablon yolundan gider
 * (AuthService → AuthRegistrationService.sendEmailVerification); burada ikinci
 * bir token üretimi yok. Manuel aktivasyon, kullanıcının linke tıklamasıyla
 * aynı sonucu üretir: `isEmailVerified=true` + açık token'lar kullanıldı.
 *
 * Toplu yollar tekil yolları sarmalar (runBulk) — audit/cache/bildirim yan
 * etkileri tek yerde kalır.
 */
@Injectable()
export class AdminUserAccountService {
  private readonly logger = new Logger(AdminUserAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly authService: AuthService,
    private readonly staffService: AdminStaffService,
    private readonly analyticsOrderService: AdminAnalyticsOrderService,
    private readonly userService: UserService,
  ) {}

  // ==================== SİLME (yalnız hiç giriş yapmamış hesap) ====================

  /**
   * Hiç giriş yapmamış hesabı siler. Kapsam bilinçli olarak dar: `lastLoginAt`
   * boş olan hesabın ilanı, siparişi, takası olamaz (hepsi oturum ister) —
   * kayıt çöpü ve yanlış e-postayla açılmış hesaplar için. Silme, kullanıcının
   * kendi hesap silme yolunun aynısı (anonimleştirme + deletedAt): PII temizlenir,
   * e-posta/telefon serbest kalır, kayıt muhasebe ilişkileri için durur.
   */
  async deleteNeverLoggedIn(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        lastLoginAt: true,
        deletedAt: true,
        createdAt: true,
        adminUser: { select: { id: true } },
      },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    if (user.adminUser) {
      throw new BadRequestException(
        i18nMessage("server.admin.user.staffAccount"),
      );
    }
    if (user.deletedAt) {
      throw new BadRequestException(i18nMessage("server.admin.user.deleted"));
    }
    if (user.lastLoginAt) {
      throw new BadRequestException(
        i18nMessage("server.admin.user.deleteRequiresNeverLoggedIn"),
      );
    }

    await this.userService.deleteAccount(userId);

    await this.audit.createRequiredAuditLog(
      adminId,
      "user_delete_never_logged_in",
      "User",
      userId,
      {
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      { deleted: true },
    );
    this.logger.warn(
      `Admin ${adminId} deleted never-logged-in user ${userId} (${user.email})`,
    );
    return { success: true, userId };
  }

  bulkDeleteNeverLoggedIn(adminId: string, ids: string[]): Promise<BulkResult> {
    return runBulk(ids, (id) => this.deleteNeverLoggedIn(adminId, id));
  }

  // ==================== AKTİVASYON ====================

  /** Aktivasyon (e-posta doğrulama) mailini yeniden gönderir. */
  async resendVerification(adminId: string, userId: string) {
    const user = await this.loadActivatableUser(userId);

    const sent = await this.authService.resendEmailVerification(userId);
    if (!sent.success) {
      this.logger.error(
        `Admin ${adminId} could not resend verification to ${user.email}: ${sent.error}`,
      );
      throw new BadRequestException(
        i18nMessage("server.admin.user.verificationMailFailed"),
      );
    }

    await this.audit.createAuditLog(
      adminId,
      "user_verification_resent",
      "User",
      userId,
      null,
      { email: user.email },
    );

    return { success: true, userId };
  }

  /**
   * Aktivasyon mailini KUYRUĞA alır — toplu gönderimin yolu.
   *
   * Ön koşullar (yok / silinmiş / zaten doğrulanmış) burada senkron kalır ki
   * toplu sonuçta `failed` listesinde gerçek sebebiyle görünsünler. Kuyruğa
   * yazıldıktan sonrası artık gönderim garantisi değil: sonuç Loglar →
   * E-postalar'dan izlenir.
   */
  async queueVerification(adminId: string, userId: string) {
    const user = await this.loadActivatableUser(userId);

    await this.authService.queueEmailVerification(userId);

    await this.audit.createAuditLog(
      adminId,
      "user_verification_resent",
      "User",
      userId,
      null,
      { email: user.email, queued: true },
    );

    return { queued: true, userId };
  }

  /** E-postayı admin adına doğrulanmış sayar (kullanıcı linke tıklamış gibi). */
  async verifyEmailByAdmin(adminId: string, userId: string) {
    const user = await this.loadActivatableUser(userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: userId },
        data: { isEmailVerified: true },
      });
      await tx.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      return result;
    });

    await this.audit.createAuditLog(
      adminId,
      "user_email_verified_by_admin",
      "User",
      userId,
      { isEmailVerified: user.isEmailVerified },
      { isEmailVerified: updated.isEmailVerified },
    );

    return { success: true, userId };
  }

  /**
   * Aktivasyon işlemlerinin ortak ön koşulu: hesap var, silinmemiş ve henüz
   * doğrulanmamış.
   */
  private async loadActivatableUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        deletedAt: true,
        isEmailVerified: true,
      },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    if (user.deletedAt) {
      throw new BadRequestException(i18nMessage("server.admin.user.deleted"));
    }
    if (user.isEmailVerified) {
      throw new BadRequestException(
        i18nMessage("server.auth.emailAlreadyVerified"),
      );
    }
    return user;
  }

  // ==================== TOPLU ====================

  bulkBan(
    adminId: string,
    ids: string[],
    dto: BanUserDto,
  ): Promise<BulkResult> {
    return runBulk(ids, (id) => this.staffService.banUser(adminId, id, dto));
  }

  bulkUnban(adminId: string, ids: string[]): Promise<BulkResult> {
    return runBulk(ids, (id) =>
      this.analyticsOrderService.unbanUser(adminId, id),
    );
  }

  /**
   * Toplu gönderim kuyruğa yazar, SMTP beklemez: 500 kullanıcıya sırayla mail
   * göndermek isteği dakikalarca tutardı. Tekil gönderim bilinçli olarak
   * senkron kalır — orada admin gerçek SMTP hatasını anında görmeli.
   */
  bulkResendVerification(adminId: string, ids: string[]): Promise<BulkResult> {
    return runBulk(ids, (id) => this.queueVerification(adminId, id));
  }

  bulkVerifyEmail(adminId: string, ids: string[]): Promise<BulkResult> {
    return runBulk(ids, (id) => this.verifyEmailByAdmin(adminId, id));
  }
}
