import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../../prisma";
import { allocateUsernameFromEmail } from "../../auth/utils/username.util";
import { AdminAuditService } from "../ops/admin-audit.service";
import { PaymentService } from "../../payment/payment.service";
import { SearchService } from "../../search/search.service";
import { CacheService } from "../../cache/cache.service";
import {
  BanUserDto,
  AssignAdminStaffDto,
  UpdateAdminStaffDto,
  UpdateStaffSettingsDto,
  SetRolePermissionsDto,
  DEFAULT_ROLE_PERMISSIONS,
  ADMIN_PERMISSION_KEYS,
  migrateLegacyPermissions,
} from "../dto";
import {
  ProductStatus,
  OfferStatus,
  TradeStatus,
  AdminRole,
} from "@prisma/client";
import { safeDecrementReserved } from "../../product/helpers/product-availability.helper";
import { randomInt } from "crypto";
import { i18nMessage } from "../../i18n";

/**
 * Admin personel/rol yönetimi (+ banner aralığındaki banUser) — AdminService'in
 * ADMIN STAFF bölümünden birebir taşındı. AdminService aynı imzalarla buraya
 * delege eder.
 */
@Injectable()
export class AdminStaffService {
  private readonly logger = new Logger(AdminStaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
  ) {}

  /** Acting kullanıcının (User.id) AdminUser.id'sini çöz (audit/createdBy için). */
  private async resolveAdminUserId(
    userId: string,
  ): Promise<string | undefined> {
    const a = await this.prisma.adminUser.findFirst({
      where: { userId },
      select: { id: true },
    });
    return a?.id;
  }

  private shapeStaff(
    s: {
      id: string;
      userId: string;
      role: AdminRole;
      isActive: boolean;
      lastLoginAt: Date | null;
      createdAt: Date;
    },
    user: {
      email: string;
      displayName: string | null;
      avatarUrl: string | null;
    },
  ) {
    return {
      id: s.id,
      userId: s.userId,
      email: user.email,
      name: user.displayName ?? user.email,
      avatarUrl: user.avatarUrl ?? undefined,
      role: s.role,
      isActive: s.isActive,
      lastLoginAt: s.lastLoginAt ?? null,
      createdAt: s.createdAt,
    };
  }

  /** Best-effort audit kaydı (admin rol işlemleri akışı bloke etmesin). */
  private async auditStaff(
    actingUserId: string,
    action: string,
    id: string,
    oldV: any,
    newV: any,
  ) {
    try {
      const adminUserId = await this.resolveAdminUserId(actingUserId);
      if (adminUserId) {
        await this.audit.createAuditLog(
          adminUserId,
          action,
          "AdminUser",
          id,
          oldV,
          newV,
        );
      }
    } catch {
      /* audit hatası işlemi bloke etmesin */
    }
  }

  private readonly STAFF_ASSIGN_SETTING_KEY = "allow_admin_assign_roles";

  /** İşlemi yapan kullanıcının (User.id) AdminUser kaydı (id + rol). */
  private async resolveActingAdmin(
    userId: string,
  ): Promise<{ id: string; role: AdminRole } | null> {
    const a = await this.prisma.adminUser.findFirst({
      where: { userId },
      select: { id: true, role: true },
    });
    return a ?? null;
  }

  /** Yöneticilerin de rol atayıp atayamayacağı ayarı. */
  async getStaffSettings() {
    const s = await this.prisma.platformSetting.findUnique({
      where: { settingKey: this.STAFF_ASSIGN_SETTING_KEY },
    });
    return { allowAdminAssign: s?.settingValue === "true" };
  }

  /** Ayarı güncelle (yalnız super_admin controller'da kilitli). */
  async setStaffSettings(actingUserId: string, dto: UpdateStaffSettingsDto) {
    const updatedBy = await this.resolveAdminUserId(actingUserId);
    const value = dto.allowAdminAssign ? "true" : "false";
    await this.prisma.platformSetting.upsert({
      where: { settingKey: this.STAFF_ASSIGN_SETTING_KEY },
      create: {
        settingKey: this.STAFF_ASSIGN_SETTING_KEY,
        settingValue: value,
        settingType: "boolean",
        description:
          "Yöneticiler (admin) de admin rolü atayabilsin mi (süper_admin hariç)",
        updatedBy,
      },
      update: { settingValue: value, updatedBy },
    });
    return { allowAdminAssign: dto.allowAdminAssign };
  }

  private readonly ROLE_PERMISSIONS_SETTING_KEY = "admin_role_permissions";

  /** Rol → izin eşleşmesini döner (platform_settings'ten; yoksa varsayılanı kullan). */
  async getRolePermissions(): Promise<Record<string, string[]>> {
    const s = await this.prisma.platformSetting.findUnique({
      where: { settingKey: this.ROLE_PERMISSIONS_SETTING_KEY },
    });
    if (!s) return DEFAULT_ROLE_PERMISSIONS;
    try {
      const raw = JSON.parse(s.settingValue) as Record<string, string[]>;
      return migrateLegacyPermissions(raw);
    } catch {
      return DEFAULT_ROLE_PERMISSIONS;
    }
  }

  /**
   * Fabrika varsayılanı rol → izin eşleşmesi. Panelin "Varsayılanlara sıfırla"
   * eylemi bunu okur: varsayılanların ikinci bir kopyası önyüzde TUTULMAZ
   * (kopya kaçınılmaz olarak kayıyor ve sıfırlama, haritada olmayan izinleri
   * — reports/invoices gibi — sessizce siliyordu).
   */
  async getDefaultRolePermissions(): Promise<Record<string, string[]>> {
    return DEFAULT_ROLE_PERMISSIONS;
  }

  /** Rol → izin eşleşmesini güncelle (yalnız super_admin). */
  async setRolePermissions(
    actingUserId: string,
    dto: SetRolePermissionsDto,
  ): Promise<Record<string, string[]>> {
    const updatedBy = await this.resolveAdminUserId(actingUserId);
    const merged = {
      ...dto.permissions,
      super_admin: [...ADMIN_PERMISSION_KEYS],
    };
    const value = JSON.stringify(merged);
    await this.prisma.platformSetting.upsert({
      where: { settingKey: this.ROLE_PERMISSIONS_SETTING_KEY },
      create: {
        settingKey: this.ROLE_PERMISSIONS_SETTING_KEY,
        settingValue: value,
        settingType: "json",
        description:
          "Admin rolleri için izin matrisi (super_admin her zaman tam yetkili)",
        updatedBy,
      },
      update: { settingValue: value, updatedBy },
    });
    return merged;
  }

  /** İşlemi yapan kişi, ilgili rol(ler) üzerinde işlem yapabilir mi? */
  private async assertCanManage(
    actingUserId: string,
    ...involvedRoles: (AdminRole | undefined)[]
  ) {
    const acting = await this.resolveActingAdmin(actingUserId);
    if (!acting)
      throw new ForbiddenException(i18nMessage("server.auth.noPermission"));
    if (acting.role === AdminRole.super_admin) return; // süper admin her şeyi yapar
    if (acting.role === AdminRole.admin) {
      const { allowAdminAssign } = await this.getStaffSettings();
      if (!allowAdminAssign) {
        throw new ForbiddenException(
          i18nMessage("server.admin.staff.roleAssignSuperAdminOnly"),
        );
      }
      if (involvedRoles.includes(AdminRole.super_admin)) {
        throw new ForbiddenException(
          i18nMessage("server.admin.staff.superAdminOnly"),
        );
      }
      return;
    }
    throw new ForbiddenException(i18nMessage("server.auth.noPermission"));
  }

  /**
   * Yeni admin hesabı için okunabilir geçici şifre üret.
   * `randomInt` (CSPRNG) şart: Math.random'ın iç durumu birkaç çıktıdan geri
   * hesaplanabilir; e-postayla giden bir admin şifresi tahmin edilebilir olamaz.
   */
  private generateTempPassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let p = "";
    for (let i = 0; i < 10; i++) {
      p += chars[randomInt(0, chars.length)];
    }
    return p + "!9";
  }

  /** Tüm admin personeli + rol başına (aktif) sayıları döndür. */
  async listAdminStaff() {
    const staff = await this.prisma.adminUser.findMany({
      include: {
        user: {
          select: { email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const roleCounts: Record<string, number> = {
      super_admin: 0,
      admin: 0,
      moderator: 0,
    };
    const items = staff.map((s) => {
      if (s.isActive) roleCounts[s.role] = (roleCounts[s.role] ?? 0) + 1;
      return this.shapeStaff(s, s.user);
    });
    return { items, roleCounts };
  }

  /** Bir e-postaya admin rolü ata. Kayıtlı değilse hesabı sistem oluşturur (admin daveti). */
  async assignAdminStaff(actingUserId: string, dto: AssignAdminStaffDto) {
    await this.assertCanManage(actingUserId, dto.role);
    const email = dto.email.toLowerCase().trim();
    let user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isEmailVerified: true,
      },
    });

    // Kayıt yoksa hesabı oluştur. Şifre verilmediyse geçici üret + yanıtta döndür (süper admin paylaşsın).
    let tempPassword: string | undefined;
    if (!user) {
      const rawPassword = dto.password || this.generateTempPassword();
      if (!dto.password) tempPassword = rawPassword;
      const passwordHash = await bcrypt.hash(rawPassword, 12);
      const displayName = dto.displayName?.trim() || email.split("@")[0];
      // Davetle açılan hesapta da kullanıcı adı sorulmaz; e-postadan türetilir.
      const username = await allocateUsernameFromEmail(this.prisma, email);
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          username,
          displayName,
          isEmailVerified: true,
          isVerified: true,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isEmailVerified: true,
        },
      });
    }

    // Davet, e-postanın sahibine güvenildiğini söyler — hesabı sistemin açtığı
    // dal bunu zaten `isEmailVerified: true` ile yazıyor. Mevcut bir hesap
    // personele terfi ettiğinde de aynısı geçerli olmalı; aksi halde admin
    // panele girebilen ama kullanıcı listesinde "Aktivasyon Bekliyor" görünen
    // bir hesap kalıyordu (adminLogin bilinçli olarak bu bayrağı aramıyor,
    // bkz. auth-token.service.ts'teki admin muafiyeti).
    if (!user.isEmailVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      await this.assertCanManage(actingUserId, existing.role, dto.role);
      const updated = await this.prisma.adminUser.update({
        where: { id: existing.id },
        data: { role: dto.role, isActive: true },
      });
      await this.auditStaff(
        actingUserId,
        "admin_staff_update",
        updated.id,
        existing,
        updated,
      );
      return { ...this.shapeStaff(updated, user), tempPassword };
    }

    const createdBy = await this.resolveAdminUserId(actingUserId);
    const created = await this.prisma.adminUser.create({
      data: { userId: user.id, role: dto.role, isActive: true, createdBy },
    });
    await this.auditStaff(
      actingUserId,
      "admin_staff_create",
      created.id,
      null,
      created,
    );
    return { ...this.shapeStaff(created, user), tempPassword };
  }

  /** Admin personelin rolünü/aktifliğini güncelle. */
  async updateAdminStaff(
    actingUserId: string,
    id: string,
    dto: UpdateAdminStaffDto,
  ) {
    const existing = await this.prisma.adminUser.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true, displayName: true, avatarUrl: true },
        },
      },
    });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.admin.staff.notFound"));
    await this.assertCanManage(actingUserId, existing.role, dto.role);

    // Son aktif süper admin'i düşürme/pasifleştirme engeli (sistemi yetkisiz bırakmamak için).
    const downgradingLastSuper =
      existing.role === AdminRole.super_admin &&
      (dto.isActive === false ||
        (dto.role != null && dto.role !== AdminRole.super_admin));
    if (downgradingLastSuper) {
      const activeSupers = await this.prisma.adminUser.count({
        where: { role: AdminRole.super_admin, isActive: true },
      });
      if (activeSupers <= 1) {
        throw new BadRequestException(
          i18nMessage("server.admin.staff.lastSuperAdminImmutable"),
        );
      }
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
    });
    await this.auditStaff(
      actingUserId,
      "admin_staff_update",
      id,
      existing,
      updated,
    );
    return this.shapeStaff(updated, existing.user);
  }

  /** Admin yetkisini tamamen kaldır (AdminUser sil). */
  async removeAdminStaff(actingUserId: string, id: string) {
    const existing = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.admin.staff.notFound"));
    await this.assertCanManage(actingUserId, existing.role);

    const acting = await this.prisma.adminUser.findFirst({
      where: { userId: actingUserId },
      select: { id: true },
    });
    if (acting?.id === id) {
      throw new BadRequestException(
        i18nMessage("server.admin.staff.cannotRemoveSelf"),
      );
    }
    if (existing.role === AdminRole.super_admin) {
      const activeSupers = await this.prisma.adminUser.count({
        where: { role: AdminRole.super_admin, isActive: true },
      });
      if (activeSupers <= 1) {
        throw new BadRequestException(
          i18nMessage("server.admin.staff.lastSuperAdminUndeletable"),
        );
      }
    }

    await this.prisma.adminUser.delete({ where: { id } });
    await this.auditStaff(
      actingUserId,
      "admin_staff_delete",
      id,
      existing,
      null,
    );
    return { success: true };
  }

  /**
   * Ban user
   * - Sets isBanned = true
   * - Sets bannedAt, bannedReason, bannedBy
   * - Sets active products to inactive
   * - Sets pending products to rejected
   * - Cancels active offers
   * - All in a transaction (all or nothing)
   */
  async banUser(adminId: string, userId: string, dto: BanUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }

    if ((user as any).isBanned) {
      throw new BadRequestException(
        i18nMessage("server.admin.user.alreadyBanned"),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. User'ı banla
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          bannedAt: new Date(),
          bannedReason: dto.reason,
          bannedBy: adminId,
        } as any,
      });

      // 2. Kargolanmamış aktif takasları iptal et. SINIR: yalnızca fiziksel mal
      //    hareket etmeden önceki aşamalar (pending / accepted / awaiting_payment).
      //    Kargo başladıysa (shipping_to_warehouse, eski *_shipped, at_warehouse
      //    ve sonrası) DOKUNMA — mal yolda/depoda; gerekirse admin müdahale eder.
      //    Rezervasyonları serbest bırak; serbest kalan ürünler (banlı kullanıcıya
      //    aitse) bir sonraki adımda suspended olur, karşı tarafınki active kalır.
      const cancellableTrades = await tx.trade.findMany({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
          status: {
            in: [
              TradeStatus.pending,
              TradeStatus.accepted,
              TradeStatus.awaiting_payment,
            ],
          },
        },
        select: { id: true, status: true, version: true },
      });
      const cancelledTradeIds: string[] = [];
      const releasedProductIds = new Set<string>();
      for (const trade of cancellableTrades) {
        // pending'de rezervasyon yok; accepted/awaiting_payment'ta var.
        if (trade.status !== TradeStatus.pending) {
          const items = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
            select: { productId: true, quantity: true },
          });
          const byProduct = new Map<string, number>();
          for (const item of items) {
            byProduct.set(
              item.productId,
              (byProduct.get(item.productId) ?? 0) + item.quantity,
            );
          }
          for (const [productId, qty] of byProduct) {
            await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
            const prod = await tx.product.findUnique({
              where: { id: productId },
              select: { reservedQuantity: true },
            });
            if (prod) {
              const newReserved = safeDecrementReserved(
                prod.reservedQuantity,
                qty,
              );
              await tx.product.update({
                where: { id: productId },
                data: {
                  reservedQuantity: newReserved,
                  status:
                    newReserved > 0
                      ? ProductStatus.reserved
                      : ProductStatus.active,
                },
              });
              releasedProductIds.add(productId);
            }
          }
        }
        await tx.trade.update({
          where: { id: trade.id, version: trade.version },
          data: {
            status: TradeStatus.cancelled,
            cancelReason: "Kullanıcı banlandığı için takas iptal edildi",
            cancelledAt: new Date(),
            version: { increment: 1 },
          },
        });
        cancelledTradeIds.push(trade.id);
      }

      // 3. Aktif ürünleri suspended (askıya alındı) yap — kullanıcının kendi
      //    pasife aldığı (inactive) ilanlardan AYRI bir state. Ban açılınca bu
      //    ilanlar otomatik active'e döner; yeniden admin onayına GİRMEZ.
      //    (Yukarıda iptal edilen takaslardan serbest kalan ürünler de buraya dahil.)
      const toSuspend = await tx.product.findMany({
        where: { sellerId: userId, status: ProductStatus.active },
        select: { id: true },
      });
      await tx.product.updateMany({
        where: {
          sellerId: userId,
          status: ProductStatus.active,
        },
        data: {
          status: ProductStatus.suspended,
        },
      });

      // 4. Bekleyen ürünleri rejected yap
      await tx.product.updateMany({
        where: {
          sellerId: userId,
          status: ProductStatus.pending,
        },
        data: {
          status: ProductStatus.rejected,
        },
      });

      // 5. Aktif teklifleri cancelled yap (buyer olarak)
      await tx.offer.updateMany({
        where: {
          buyerId: userId,
          status: OfferStatus.pending,
        },
        data: {
          status: OfferStatus.cancelled,
        },
      });

      // 6. Audit log oluştur
      await this.audit.createAuditLog(
        adminId,
        "user_ban",
        "User",
        userId,
        user,
        updatedUser,
      );

      this.logger.warn(
        `User ${userId} banned by admin ${adminId}: ${dto.reason}`,
      );

      return {
        success: true,
        userId,
        reason: dto.reason,
        suspendedIds: toSuspend.map((p) => p.id),
        cancelledTradeIds,
        // Suspended + iptal edilen takaslardan serbest kalan (karşı tarafın da)
        // ürünleri ES'te güncellemek için birleşik küme.
        affectedProductIds: Array.from(
          new Set([...toSuspend.map((p) => p.id), ...releasedProductIds]),
        ),
      };
    });

    // İptal edilen takasların nakit ayağı tamamlandıysa iade et.
    for (const tradeId of result.cancelledTradeIds) {
      await this.paymentService
        .refundTradeCashPaymentIfCompleted(tradeId)
        .catch((err) =>
          this.logger.warn(
            `Ban: trade refund failed for ${tradeId}: ${err?.message}`,
          ),
        );
    }

    // Etkilenen ilanları arama/listeden senkronla (suspended → düşer, serbest
    // kalan karşı taraf ürünü → yeniden indekslenir).
    if (result.affectedProductIds.length > 0) {
      await this.cache.delPattern("products:list:*");
      await Promise.all(
        result.affectedProductIds.map((id) =>
          this.cache.del(`product:${id}`).catch(() => {}),
        ),
      );
      for (const id of result.affectedProductIds) {
        this.searchService
          .syncProduct(id)
          .catch((err) =>
            this.logger.warn(`ES sync (ban) failed for ${id}: ${err?.message}`),
          );
      }
    }

    return { success: true, userId, reason: dto.reason };
  }
}
