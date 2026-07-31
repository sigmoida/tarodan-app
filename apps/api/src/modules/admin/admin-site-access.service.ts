import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { NotificationService } from "../notification/notification.service";
import { SiteAccessPinService } from "../site-access/site-access-pin.service";
import { AdminAuditService } from "./admin-audit.service";
import { paginate } from "../../common/list";
import {
  CreateSiteAccessPinDto,
  SiteAccessPinQueryDto,
  UpdateSiteAccessPinDto,
} from "./dto";

export const SITE_ACCESS_INVITE_TEMPLATE = "site-access-invite";

/**
 * Admin management of early-access invite codes (pre-launch site lock).
 * Code generation + the public verify path live in SiteAccessPinService.
 */
@Injectable()
export class AdminSiteAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pinService: SiteAccessPinService,
    private readonly notificationService: NotificationService,
    private readonly audit: AdminAuditService,
  ) {}

  async getPins(query: SiteAccessPinQueryDto) {
    const { search, status } = query;
    const filters: Prisma.SiteAccessPinWhereInput[] = [];

    if (search) {
      filters.push({
        OR: [
          { label: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { code: { contains: this.pinService.normalizeCode(search) } },
        ],
      });
    }
    if (status === "active") {
      filters.push({ isActive: true });
      filters.push({
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      });
    } else if (status === "revoked") {
      filters.push({ isActive: false });
    } else if (status === "expired") {
      filters.push({ expiresAt: { lte: new Date() } });
    }

    return paginate(
      this.prisma.siteAccessPin,
      {
        where: filters.length ? { AND: filters } : {},
        orderBy: { createdAt: "desc" },
      },
      query,
    );
  }

  async createPin(adminId: string, dto: CreateSiteAccessPinDto) {
    const adminUserId = await this.resolveAdminUserId(adminId);
    const pin = await this.pinService.createWithUniqueCode({
      label: dto.label,
      email: dto.email || null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      maxUses: dto.maxUses ?? null,
      createdBy: adminUserId,
    });

    await this.auditLog(
      adminUserId,
      "site_access_pin.create",
      pin.id,
      null,
      pin,
    );

    if (dto.sendEmail && pin.email) {
      return this.sendInvite(adminId, pin.id);
    }
    return pin;
  }

  async updatePin(adminId: string, id: string, dto: UpdateSiteAccessPinDto) {
    const existing = await this.prisma.siteAccessPin.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Erişim kodu bulunamadı");

    const updated = await this.prisma.siteAccessPin.update({
      where: { id },
      data: {
        label: dto.label,
        email: dto.email !== undefined ? dto.email || null : undefined,
        expiresAt:
          dto.expiresAt !== undefined
            ? dto.expiresAt
              ? new Date(dto.expiresAt)
              : null
            : undefined,
        maxUses: dto.maxUses !== undefined ? dto.maxUses : undefined,
        isActive: dto.isActive,
      },
    });

    const adminUserId = await this.resolveAdminUserId(adminId);
    await this.auditLog(
      adminUserId,
      "site_access_pin.update",
      id,
      existing,
      updated,
    );
    return updated;
  }

  async deletePin(adminId: string, id: string) {
    const existing = await this.prisma.siteAccessPin.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Erişim kodu bulunamadı");

    await this.prisma.siteAccessPin.delete({ where: { id } });

    const adminUserId = await this.resolveAdminUserId(adminId);
    await this.auditLog(
      adminUserId,
      "site_access_pin.delete",
      id,
      existing,
      null,
    );
    return { success: true };
  }

  async sendInvite(adminId: string, id: string) {
    const pin = await this.prisma.siteAccessPin.findUnique({ where: { id } });
    if (!pin) throw new NotFoundException("Erişim kodu bulunamadı");
    if (!pin.email) {
      throw new BadRequestException(
        "Bu erişim kodunun e-posta adresi yok; önce e-posta ekleyin.",
      );
    }

    await this.notificationService.sendTemplateEmailToAddress(
      pin.email,
      SITE_ACCESS_INVITE_TEMPLATE,
      { name: pin.label, code: pin.code },
    );

    const updated = await this.prisma.siteAccessPin.update({
      where: { id },
      data: { lastSentAt: new Date() },
    });

    const adminUserId = await this.resolveAdminUserId(adminId);
    await this.auditLog(adminUserId, "site_access_pin.send_invite", id, null, {
      email: pin.email,
    });
    return updated;
  }

  private async resolveAdminUserId(userId: string): Promise<string | null> {
    const adminUser = await this.prisma.adminUser.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    return adminUser?.id ?? null;
  }

  private async auditLog(
    adminUserId: string | null,
    action: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    if (!adminUserId) return;
    await this.audit.createAuditLog(
      adminUserId,
      action,
      "SiteAccessPin",
      entityId,
      oldValue,
      newValue,
    );
  }
}
