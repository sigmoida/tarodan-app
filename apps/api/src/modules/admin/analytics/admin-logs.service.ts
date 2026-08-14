import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import {
  fulltextErrorLogSearch,
  fulltextSecurityLogSearch,
  fulltextEmailLogSearch,
} from "../../../common/helpers/fulltext-search";
import { Prisma } from "@prisma/client";
import {
  EmailLogQueryDto,
  ErrorLogQueryDto,
  SecurityLogQueryDto,
} from "../dto";
import {
  paginate,
  paginateComputedRows,
  resolveOrderBy,
} from "../../../common/list";
import { i18nMessage } from "../../i18n";

/**
 * Sistem log görünümleri admin operasyonları — AdminService'in ERROR LOGS /
 * SECURITY LOGS / EMAIL LOGS bölümlerinden (üç komşu banner) birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminLogsService {
  private readonly logger = new Logger(AdminLogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  // ==================== ERROR LOGS ====================

  /**
   * Get error logs with filtering and pagination
   */
  async getErrorLogs(query: ErrorLogQueryDto) {
    const { severity, source, userId, startDate, endDate, search } = query;
    const where: Prisma.ErrorLogWhereInput = {};

    if (severity) where.severity = severity;
    if (source) where.source = source;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      const ids = await fulltextErrorLogSearch(this.prisma, search);
      where.OR = [
        { message: { contains: search, mode: "insensitive" } },
        { source: { contains: search, mode: "insensitive" } },
        { endpoint: { contains: search, mode: "insensitive" } },
        { requestId: { contains: search, mode: "insensitive" } },
        { userId: { contains: search, mode: "insensitive" } },
      ];
      if (ids.length > 0) where.OR.push({ id: { in: ids } });
    }

    let result;
    if (query.sortBy === "metadata.status") {
      const allLogs = await this.prisma.errorLog.findMany({ where });
      result = paginateComputedRows(
        allLogs,
        (log) =>
          (log.metadata as Record<string, unknown> | null)?.status ?? null,
        { ...query, sortType: "number" },
      );
    } else {
      const orderBy = resolveOrderBy<Prisma.ErrorLogOrderByWithRelationInput>(
        "ErrorLog",
        query,
        { defaultSort: { createdAt: "desc" } },
      );
      result = await paginate(this.prisma.errorLog, { where, orderBy }, query);
    }

    // Get severity stats
    const stats = await this.prisma.errorLog.groupBy({
      by: ["severity"],
      _count: { id: true },
      where:
        startDate || endDate
          ? {
              createdAt: where.createdAt,
            }
          : undefined,
    });

    return {
      ...result,
      stats: {
        critical: stats.find((s) => s.severity === "critical")?._count?.id || 0,
        error: stats.find((s) => s.severity === "error")?._count?.id || 0,
        warning: stats.find((s) => s.severity === "warning")?._count?.id || 0,
      },
    };
  }

  // ==================== SECURITY LOGS ====================

  /**
   * Get security logs with filtering and pagination
   */
  async getSecurityLogs(query: SecurityLogQueryDto) {
    const {
      eventType,
      severity,
      ipAddress,
      userId,
      resolved,
      startDate,
      endDate,
      search,
    } = query;
    const where: Prisma.SecurityLogWhereInput = {};

    if (eventType) where.eventType = eventType;
    if (severity) where.severity = severity;
    if (ipAddress) where.ipAddress = ipAddress;
    if (userId) where.userId = userId;
    if (resolved !== undefined) where.resolved = resolved;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      const ids = await fulltextSecurityLogSearch(this.prisma, search);
      const normalized = search.trim().toLowerCase();
      where.OR = [
        { eventType: { contains: search, mode: "insensitive" } },
        { severity: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
        { userAgent: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { userId: { contains: search, mode: "insensitive" } },
      ];
      if (ids.length > 0) where.OR.push({ id: { in: ids } });
      if (["true", "resolved", "çözüldü"].includes(normalized))
        where.OR.push({ resolved: true });
      if (["false", "unresolved", "bekliyor"].includes(normalized))
        where.OR.push({ resolved: false });
    }

    const orderBy = resolveOrderBy<Prisma.SecurityLogOrderByWithRelationInput>(
      "SecurityLog",
      query,
      { defaultSort: { createdAt: "desc" } },
    );
    const result = await paginate(
      this.prisma.securityLog,
      {
        where,
        orderBy,
      },
      query,
    );

    // Get event type stats
    const stats = await this.prisma.securityLog.groupBy({
      by: ["eventType"],
      _count: { id: true },
      where: { resolved: false },
    });

    // Count unresolved high severity
    const unresolvedHighSeverity = await this.prisma.securityLog.count({
      where: { resolved: false, severity: { in: ["high", "critical"] } },
    });

    return {
      ...result,
      stats: {
        byEventType: stats.reduce(
          (acc, s) => {
            acc[s.eventType] = s._count.id;
            return acc;
          },
          {} as Record<string, number>,
        ),
        unresolvedHighSeverity,
      },
    };
  }

  /**
   * Resolve a security issue
   */
  async resolveSecurityIssue(adminId: string, logId: string, notes?: string) {
    const existing = await this.prisma.securityLog.findUnique({
      where: { id: logId },
    });

    if (!existing) {
      throw new NotFoundException(
        i18nMessage("server.admin.security.logNotFound"),
      );
    }

    if (existing.resolved) {
      throw new BadRequestException(
        i18nMessage("server.admin.security.alreadyResolved"),
      );
    }

    const updated = await this.prisma.securityLog.update({
      where: { id: logId },
      data: {
        resolved: true,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        details: {
          ...((existing.details as Record<string, any>) || {}),
          resolutionNotes: notes,
        },
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "security_issue_resolve",
      "SecurityLog",
      logId,
      existing,
      updated,
    );

    this.logger.log(`Security issue ${logId} resolved by admin ${adminId}`);

    return updated;
  }

  /**
   * Block an IP address
   */
  async blockIP(adminId: string, ipAddress: string, reason?: string) {
    // Log the block action
    const blockLog = await this.prisma.securityLog.create({
      data: {
        eventType: "ip_block",
        severity: "high",
        ipAddress,
        details: { reason, blockedBy: adminId },
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "ip_block",
      "SecurityLog",
      blockLog.id,
      null,
      blockLog,
    );

    this.logger.log(
      `IP ${ipAddress} blocked by admin ${adminId}. Reason: ${reason}`,
    );

    return { success: true, ipAddress, blockedAt: blockLog.createdAt };
  }

  // ==================== EMAIL LOGS ====================

  /**
   * Get email logs with filtering and pagination
   */
  async getEmailLogs(query: EmailLogQueryDto) {
    const { status, template, to, userId, startDate, endDate, search } = query;
    const where: Prisma.EmailLogWhereInput = {};

    if (status) where.status = status;
    if (template) where.template = template;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const searchTerm = search || to;
    if (searchTerm) {
      const ids = await fulltextEmailLogSearch(this.prisma, searchTerm);
      where.OR = [
        { to: { contains: searchTerm, mode: "insensitive" } },
        { subject: { contains: searchTerm, mode: "insensitive" } },
        { template: { contains: searchTerm, mode: "insensitive" } },
        { status: { contains: searchTerm, mode: "insensitive" } },
        { userId: { contains: searchTerm, mode: "insensitive" } },
      ];
      if (ids.length > 0) where.OR.push({ id: { in: ids } });
    }

    const orderBy = resolveOrderBy<Prisma.EmailLogOrderByWithRelationInput>(
      "EmailLog",
      query,
      { defaultSort: { createdAt: "desc" } },
    );
    const result = await paginate(
      this.prisma.emailLog,
      {
        where,
        orderBy,
      },
      query,
    );

    // Get status stats
    const stats = await this.prisma.emailLog.groupBy({
      by: ["status"],
      _count: { id: true },
      where:
        startDate || endDate
          ? {
              createdAt: where.createdAt,
            }
          : undefined,
    });

    // Get template stats
    const templateStats = await this.prisma.emailLog.groupBy({
      by: ["template"],
      _count: { id: true },
      where: {
        template: { not: null },
        createdAt: startDate || endDate ? where.createdAt : undefined,
      },
      take: 10,
      orderBy: { _count: { id: "desc" } },
    });

    return {
      ...result,
      stats: {
        byStatus: stats.reduce(
          (acc, s) => {
            acc[s.status] = s._count.id;
            return acc;
          },
          {} as Record<string, number>,
        ),
        byTemplate: templateStats.reduce(
          (acc, s) => {
            if (s.template) acc[s.template] = s._count.id;
            return acc;
          },
          {} as Record<string, number>,
        ),
        // `delivered` / `bounced` HİÇBİR kod yolunda yazılmıyor (sağlayıcı
        // webhook'u yok), o yüzden eski "teslimat/bounce oranı" hesapları
        // matematiksel olarak daima 0 dönüyordu. Yerine gerçekten
        // hesaplanabilen başarısızlık oranı: failed / toplam.
        failureRate: (() => {
          const total = stats.reduce((sum, s) => sum + s._count.id, 0);
          const failed =
            stats.find((s) => s.status === "failed")?._count?.id || 0;
          return total > 0 ? Math.round((failed / total) * 100) : 0;
        })(),
      },
    };
  }
}
