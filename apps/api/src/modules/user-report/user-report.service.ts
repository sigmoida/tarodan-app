/**
 * User Report Service
 * Handles user-generated reports for products, users, collections, and messages
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  CreateReportDto,
  ReportType,
  ReportReason,
  ReportStatus,
  UpdateReportStatusDto,
  ReportResponseDto,
  AdminReportQueryDto,
} from "./dto";
import { Prisma } from "@prisma/client";
import { dateRangeWhere, paginate, resolveOrderBy } from "../../common/list";
import { i18nMessage } from "../i18n";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { adminUrl } from "../../config/app-urls";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

@Injectable()
export class UserReportService {
  private readonly logger = new Logger(UserReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Create a new report
   */
  async createReport(
    reporterId: string,
    dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    // Validate target exists
    await this.validateTarget(dto.type, dto.targetId);

    // Check for duplicate reports
    const existingReport = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetId: dto.targetId,
        type: dto.type,
        status: ReportStatus.PENDING,
      },
    });

    if (existingReport) {
      throw new BadRequestException(
        i18nMessage("server.userReport.alreadyPending"),
      );
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        type: dto.type,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description,
        status: ReportStatus.PENDING,
      },
    });

    this.logger.log(
      `Report created: ${report.id} by user ${reporterId} for ${dto.type}:${dto.targetId}`,
    );

    await this.notifyAdmins(report.id, reporterId, dto);

    return this.mapToResponse(report);
  }

  /**
   * Get user's reports
   */
  async getUserReports(userId: string): Promise<ReportResponseDto[]> {
    const userReports = await this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: "desc" },
    });

    return userReports.map((r) => this.mapToResponse(r));
  }

  /**
   * Get all reports (admin only)
   */
  async getAllReports(query: AdminReportQueryDto) {
    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    const search = query.search?.trim();
    if (search) {
      // Full-content search across every displayed column (#381): the reports
      // table shows type, reason, description, reporter and status — type/reason/
      // status are stored as free-text strings, so `contains` matches partials
      // (not just exact enum values).
      where.OR = [
        { targetId: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { type: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        { status: { contains: search, mode: "insensitive" } },
        {
          reporter: { displayName: { contains: search, mode: "insensitive" } },
        },
        { reporter: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    Object.assign(where, dateRangeWhere(query));

    const orderBy = resolveOrderBy<Prisma.ReportOrderByWithRelationInput>(
      "Report",
      query,
      { defaultSort: { createdAt: "desc" } },
    );
    const result = await paginate(
      this.prisma.report,
      {
        where,
        orderBy,
        include: {
          reporter: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
      query,
    );

    return {
      ...result,
      data: result.data.map((r) => ({
        ...this.mapToResponse(r),
        reporter: r.reporter,
      })),
    };
  }

  /**
   * Get report by ID (admin only)
   */
  async getReportById(
    reportId: string,
  ): Promise<ReportResponseDto & { reporter: any; target: any }> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException(i18nMessage("server.userReport.notFound"));
    }

    // Get target info based on type
    let target: any = null;
    try {
      target = await this.getTargetInfo(
        report.type as ReportType,
        report.targetId,
      );
    } catch (e) {
      target = { id: report.targetId, deleted: true };
    }

    return {
      ...this.mapToResponse(report),
      reporter: report.reporter,
      target,
    };
  }

  /**
   * Update report status (admin only)
   */
  async updateReportStatus(
    reportId: string,
    adminId: string,
    dto: UpdateReportStatusDto,
  ): Promise<ReportResponseDto> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException(i18nMessage("server.userReport.notFound"));
    }

    const isClosing =
      dto.status === ReportStatus.RESOLVED ||
      dto.status === ReportStatus.DISMISSED;

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        adminNote: dto.adminNote,
        resolvedAt: isClosing ? new Date() : null,
        resolvedBy: isClosing ? adminId : null,
      },
    });

    this.logger.log(
      `Report ${reportId} status updated to ${dto.status} by admin ${adminId}`,
    );

    // Karar verildiyse şikayet eden haberdar edilir. `under_review` ara durumu
    // henüz bir sonuç değil — o aşamada kullanıcıya bildirim gitmez.
    if (isClosing) {
      await this.notifyReporterOfDecision(updated);
    }

    return this.mapToResponse(updated);
  }

  /**
   * Get report statistics (admin only)
   */
  async getReportStats(): Promise<{
    total: number;
    pending: number;
    underReview: number;
    resolved: number;
    dismissed: number;
    byType: Record<string, number>;
    byReason: Record<string, number>;
  }> {
    const all = await this.prisma.report.findMany({
      select: { status: true, type: true, reason: true },
    });

    const byType: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const r of all) {
      byType[r.type] = (byType[r.type] || 0) + 1;
      byReason[r.reason] = (byReason[r.reason] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }

    return {
      total: all.length,
      pending: byStatus[ReportStatus.PENDING] || 0,
      underReview: byStatus[ReportStatus.UNDER_REVIEW] || 0,
      resolved: byStatus[ReportStatus.RESOLVED] || 0,
      dismissed: byStatus[ReportStatus.DISMISSED] || 0,
      byType,
      byReason,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Apple App Review "notify the developer": her şikayet aktif admin'lere
   * in-app bildirim olarak düşer. Bildirim hatası şikayeti geri almaz.
   */
  private async notifyAdmins(
    reportId: string,
    reporterId: string,
    dto: CreateReportDto,
  ): Promise<void> {
    try {
      const reporter = await this.prisma.user.findUnique({
        where: { id: reporterId },
        select: PUBLIC_NAME_SELECT,
      });
      await this.notifications.notifyAllAdmins(
        NotificationType.USER_REPORTED_ADMIN,
        {
          reportId,
          reporterId,
          reporterName: publicName(reporter),
          // Tür/gerekçe etiketleri şablonda (ICU select) alıcının diline göre.
          type: dto.type,
          targetId: dto.targetId,
          reason: dto.reason,
          adminLink: `${adminUrl()}/accounts/reports?search=${reportId}`,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `Report admin notification failed (${reportId}): ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Şikayet eden kullanıcıya kararı bildirir: in-app bildirim + e-posta.
   * `adminNote` panelde "kullanıcıya iletilecek açıklama" olarak girilir, yani
   * iç not değil — kullanıcının gördüğü metin budur.
   *
   * Bildirim hatası kararı geri almaz (şikayet zaten kapandı); tıpkı
   * `notifyAdmins` gibi yutulur ve loglanır.
   */
  private async notifyReporterOfDecision(report: {
    id: string;
    reporterId: string;
    type: string;
    reason: string;
    status: string;
    adminNote: string | null;
    createdAt: Date;
  }): Promise<void> {
    try {
      await this.notifications.createInAppNotification(
        report.reporterId,
        NotificationType.REPORT_RESOLVED,
        {
          reportId: report.id,
          // Tür/durum etiketleri şablonda (ICU select) alıcının diline göre.
          type: report.type,
          status: report.status,
          hasNote: report.adminNote ? "yes" : "no",
          note: report.adminNote ?? "",
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `Report reporter notification failed (${report.id}): ${err?.message ?? err}`,
      );
    }

    try {
      const reporter = await this.prisma.user.findUnique({
        where: { id: report.reporterId },
        select: PUBLIC_NAME_SELECT,
      });
      await this.notifications.sendTemplateEmailToUser(
        report.reporterId,
        "report-resolved",
        {
          reporterName: publicName(reporter),
          type: report.type,
          reason: report.reason,
          status: report.status,
          adminNote: report.adminNote ?? "",
          createdAt: report.createdAt,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `Report reporter email failed (${report.id}): ${err?.message ?? err}`,
      );
    }
  }

  private async validateTarget(
    type: ReportType,
    targetId: string,
  ): Promise<void> {
    switch (type) {
      case ReportType.PRODUCT:
        const product = await this.prisma.product.findUnique({
          where: { id: targetId },
        });
        if (!product)
          throw new NotFoundException(i18nMessage("server.product.notFound"));
        break;

      case ReportType.USER:
        const user = await this.prisma.user.findUnique({
          where: { id: targetId },
        });
        if (!user)
          throw new NotFoundException(i18nMessage("server.user.notFound"));
        break;

      case ReportType.COLLECTION:
        const collection = await this.prisma.collection.findUnique({
          where: { id: targetId },
        });
        if (!collection)
          throw new NotFoundException(
            i18nMessage("server.collection.notFound"),
          );
        break;

      case ReportType.MESSAGE:
        const message = await this.prisma.message.findUnique({
          where: { id: targetId },
        });
        if (!message)
          throw new NotFoundException(
            i18nMessage("server.messaging.messageNotFound"),
          );
        break;

      default:
        throw new BadRequestException(
          i18nMessage("server.userReport.invalidType"),
        );
    }
  }

  private async getTargetInfo(
    type: ReportType,
    targetId: string,
  ): Promise<any> {
    switch (type) {
      case ReportType.PRODUCT:
        return this.prisma.product.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            title: true,
            status: true,
            seller: { select: { id: true, displayName: true } },
          },
        });

      case ReportType.USER:
        return this.prisma.user.findUnique({
          where: { id: targetId },
          select: { id: true, displayName: true, email: true, isBanned: true },
        });

      case ReportType.COLLECTION:
        return this.prisma.collection.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            name: true,
            user: { select: { id: true, displayName: true } },
          },
        });

      case ReportType.MESSAGE:
        return this.prisma.message.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, displayName: true } },
          },
        });

      default:
        return null;
    }
  }

  private mapToResponse(report: {
    id: string;
    type: string;
    targetId: string;
    reason: string;
    description: string | null;
    status: string;
    createdAt: Date;
    resolvedAt: Date | null;
    adminNote: string | null;
  }): ReportResponseDto {
    return {
      id: report.id,
      type: report.type as ReportType,
      targetId: report.targetId,
      reason: report.reason as ReportReason,
      description: report.description ?? undefined,
      status: report.status as ReportStatus,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt ?? undefined,
      adminNote: report.adminNote ?? undefined,
    };
  }
}
