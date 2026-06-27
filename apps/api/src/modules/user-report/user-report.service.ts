/**
 * User Report Service
 * Handles user-generated reports for products, users, collections, and messages
 */
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { 
  CreateReportDto, 
  ReportType, 
  ReportReason, 
  ReportStatus,
  UpdateReportStatusDto,
  ReportResponseDto 
} from './dto';

@Injectable()
export class UserReportService {
  private readonly logger = new Logger(UserReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new report
   */
  async createReport(reporterId: string, dto: CreateReportDto): Promise<ReportResponseDto> {
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
      throw new BadRequestException('Bu içerik için zaten bekleyen bir raporunuz var');
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

    this.logger.log(`Report created: ${report.id} by user ${reporterId} for ${dto.type}:${dto.targetId}`);

    return this.mapToResponse(report);
  }

  /**
   * Get user's reports
   */
  async getUserReports(userId: string): Promise<ReportResponseDto[]> {
    const userReports = await this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return userReports.map(r => this.mapToResponse(r));
  }

  /**
   * Get all reports (admin only)
   */
  async getAllReports(
    status?: ReportStatus,
    type?: ReportType,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ reports: ReportResponseDto[]; total: number; page: number; pageSize: number }> {
    const where: { status?: string; type?: string } = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          reporter: { select: { id: true, displayName: true, email: true } },
        },
      }),
    ]);

    return {
      reports: rows.map(r => ({
        ...this.mapToResponse(r),
        reporter: r.reporter,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get report by ID (admin only)
   */
  async getReportById(reportId: string): Promise<ReportResponseDto & { reporter: any; target: any }> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, displayName: true, email: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Rapor bulunamadı');
    }

    // Get target info based on type
    let target: any = null;
    try {
      target = await this.getTargetInfo(report.type as ReportType, report.targetId);
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
    dto: UpdateReportStatusDto
  ): Promise<ReportResponseDto> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });

    if (!report) {
      throw new NotFoundException('Rapor bulunamadı');
    }

    const isClosing = dto.status === ReportStatus.RESOLVED || dto.status === ReportStatus.DISMISSED;

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        adminNote: dto.adminNote,
        resolvedAt: isClosing ? new Date() : null,
        resolvedBy: isClosing ? adminId : null,
      },
    });

    this.logger.log(`Report ${reportId} status updated to ${dto.status} by admin ${adminId}`);

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

  private async validateTarget(type: ReportType, targetId: string): Promise<void> {
    switch (type) {
      case ReportType.PRODUCT:
        const product = await this.prisma.product.findUnique({ where: { id: targetId } });
        if (!product) throw new NotFoundException('Ürün bulunamadı');
        break;

      case ReportType.USER:
        const user = await this.prisma.user.findUnique({ where: { id: targetId } });
        if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
        break;

      case ReportType.COLLECTION:
        const collection = await this.prisma.collection.findUnique({ where: { id: targetId } });
        if (!collection) throw new NotFoundException('Koleksiyon bulunamadı');
        break;

      case ReportType.MESSAGE:
        const message = await this.prisma.message.findUnique({ where: { id: targetId } });
        if (!message) throw new NotFoundException('Mesaj bulunamadı');
        break;

      default:
        throw new BadRequestException('Geçersiz rapor tipi');
    }
  }

  private async getTargetInfo(type: ReportType, targetId: string): Promise<any> {
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
