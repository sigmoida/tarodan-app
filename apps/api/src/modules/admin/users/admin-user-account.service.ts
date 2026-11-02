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
 * Admin account activation (e-mail verification) and bulk user actions.
 *
 * The activation mail goes through the SAME token and template path as
 * registration (AuthService -> AuthRegistrationService.sendEmailVerification);
 * no second token is minted here. Manual activation has the link's outcome
 * (AuthService.markEmailVerifiedByAdmin): `isEmailVerified=true`, open links
 * spent and the guest order claim requested.
 *
 * Bulk paths wrap the single paths (runBulk), so the audit, cache and
 * notification side effects stay in one place.
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

    // Kimlik arşivine "yönetici sildi" olarak damgalanır — yasal kayıtta
    // silmeyi kimin başlattığı tahmin edilemez olmamalı.
    await this.userService.deleteAccount(userId, {
      actor: "admin",
      adminUserId: adminId,
    });

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

  /**
   * Marks the e-mail verified on the user's behalf, as if they had clicked
   * the link: the write (and the guest order claim it requests) goes through
   * the auth domain; the audit log stays here.
   */
  async verifyEmailByAdmin(adminId: string, userId: string) {
    const user = await this.loadActivatableUser(userId);

    const updated = await this.authService.markEmailVerifiedByAdmin(userId);

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
