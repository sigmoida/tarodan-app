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

// In-memory storage for reports until schema is updated
// In production, this would be stored in the database
interface StoredReport {
  id: string;
  reporterId: string;
  type: ReportType;
  targetId: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  adminNote?: string;
}

@Injectable()
export class UserReportService {
  private readonly logger = new Logger(UserReportService.name);
  
  // Temporary in-memory storage (will be replaced with database when schema is updated)
  private reports: Map<string, StoredReport> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new report
   */
  async createReport(reporterId: string, dto: CreateReportDto): Promise<ReportResponseDto> {
    // Validate target exists
    await this.validateTarget(dto.type, dto.targetId);

    // Check for duplicate reports
    const existingReport = Array.from(this.reports.values()).find(
      r => r.reporterId === reporterId && 
           r.targetId === dto.targetId && 
           r.type === dto.type &&
           r.status === ReportStatus.PENDING
    );

    if (existingReport) {
      throw new BadRequestException('Bu içerik için zaten bekleyen bir raporunuz var');
    }

    // Create report
    const report: StoredReport = {
      id: this.generateUUID(),
      reporterId,
      type: dto.type,
      targetId: dto.targetId,
      reason: dto.reason,
      description: dto.description,
      status: ReportStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.reports.set(report.id, report);

    this.logger.log(`Report created: ${report.id} by user ${reporterId} for ${dto.type}:${dto.targetId}`);

    return this.mapToResponse(report);
  }

  /**
   * Get user's reports
   */
  async getUserReports(userId: string): Promise<ReportResponseDto[]> {
    const userReports = Array.from(this.reports.values())
      .filter(r => r.reporterId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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
    let filteredReports = Array.from(this.reports.values());

    if (status) {
      filteredReports = filteredReports.filter(r => r.status === status);
    }

    if (type) {
      filteredReports = filteredReports.filter(r => r.type === type);
    }

    // Sort by creation date (newest first)
    filteredReports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = filteredReports.length;
    const skip = (page - 1) * pageSize;
    const paginatedReports = filteredReports.slice(skip, skip + pageSize);

    return {
      reports: paginatedReports.map(r => this.mapToResponse(r)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get report by ID (admin only)
   */
  async getReportById(reportId: string): Promise<ReportResponseDto & { reporter: any; target: any }> {
    const report = this.reports.get(reportId);

    if (!report) {
      throw new NotFoundException('Rapor bulunamadı');
    }

    // Get reporter info
    const reporter = await this.prisma.user.findUnique({
      where: { id: report.reporterId },
      select: { id: true, displayName: true, email: true },
    });

    // Get target info based on type
    let target: any = null;
    try {
      target = await this.getTargetInfo(report.type, report.targetId);
    } catch (e) {
      target = { id: report.targetId, deleted: true };
    }

    return {
      ...this.mapToResponse(report),
      reporter,
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
    const report = this.reports.get(reportId);

    if (!report) {
      throw new NotFoundException('Rapor bulunamadı');
    }

    report.status = dto.status;
    report.adminNote = dto.adminNote;
    report.updatedAt = new Date();

    if (dto.status === ReportStatus.RESOLVED || dto.status === ReportStatus.DISMISSED) {
      report.resolvedAt = new Date();
      report.resolvedBy = adminId;
    }

    this.reports.set(reportId, report);

    this.logger.log(`Report ${reportId} status updated to ${dto.status} by admin ${adminId}`);

    return this.mapToResponse(report);
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
    const allReports = Array.from(this.reports.values());

    const byStatus = {
      pending: allReports.filter(r => r.status === ReportStatus.PENDING).length,
      underReview: allReports.filter(r => r.status === ReportStatus.UNDER_REVIEW).length,
      resolved: allReports.filter(r => r.status === ReportStatus.RESOLVED).length,
      dismissed: allReports.filter(r => r.status === ReportStatus.DISMISSED).length,
    };

    const byType: Record<string, number> = {};
    const byReason: Record<string, number> = {};

    for (const report of allReports) {
      byType[report.type] = (byType[report.type] || 0) + 1;
      byReason[report.reason] = (byReason[report.reason] || 0) + 1;
    }

    return {
      total: allReports.length,
      ...byStatus,
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

  private mapToResponse(report: StoredReport): ReportResponseDto {
    return {
      id: report.id,
      type: report.type,
      targetId: report.targetId,
      reason: report.reason,
      description: report.description,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      adminNote: report.adminNote,
    };
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
