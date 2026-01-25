/**
 * User Report Controller
 * Handles user-generated reports for products, users, collections, and messages
 */
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { AdminRole } from '@prisma/client';
import { UserReportService } from './user-report.service';
import {
  CreateReportDto,
  UpdateReportStatusDto,
  ReportResponseDto,
  ReportStatus,
  ReportType,
} from './dto';

@ApiTags('reports')
@Controller('user-reports')
export class UserReportController {
  constructor(private readonly reportService: UserReportService) {}

  // ==========================================================================
  // USER ENDPOINTS
  // ==========================================================================

  /**
   * Create a new report
   * POST /user-reports
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'İçerik raporla (ürün, kullanıcı, koleksiyon, mesaj)' })
  @ApiResponse({ status: 201, description: 'Rapor oluşturuldu', type: ReportResponseDto })
  @ApiResponse({ status: 400, description: 'Geçersiz istek' })
  @ApiResponse({ status: 404, description: 'Hedef bulunamadı' })
  async createReport(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    return this.reportService.createReport(userId, dto);
  }

  /**
   * Get my reports
   * GET /user-reports/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kendi raporlarımı listele' })
  @ApiResponse({ status: 200, description: 'Raporlar listesi', type: [ReportResponseDto] })
  async getMyReports(@CurrentUser('id') userId: string): Promise<ReportResponseDto[]> {
    return this.reportService.getUserReports(userId);
  }

  // ==========================================================================
  // ADMIN ENDPOINTS
  // ==========================================================================

  /**
   * Get all reports (admin only)
   * GET /user-reports/admin
   */
  @Get('admin')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tüm raporları listele (admin)' })
  @ApiQuery({ name: 'status', enum: ReportStatus, required: false })
  @ApiQuery({ name: 'type', enum: ReportType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'pageSize', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Raporlar listesi' })
  async getAllReports(
    @Query('status') status?: ReportStatus,
    @Query('type') type?: ReportType,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.reportService.getAllReports(status, type, page || 1, pageSize || 20);
  }

  /**
   * Get report statistics (admin only)
   * GET /user-reports/admin/stats
   */
  @Get('admin/stats')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rapor istatistikleri (admin)' })
  @ApiResponse({ status: 200, description: 'İstatistikler' })
  async getReportStats() {
    return this.reportService.getReportStats();
  }

  /**
   * Get report by ID (admin only)
   * GET /user-reports/admin/:id
   */
  @Get('admin/:id')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rapor detayı (admin)' })
  @ApiResponse({ status: 200, description: 'Rapor detayı' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  async getReportById(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportService.getReportById(id);
  }

  /**
   * Update report status (admin only)
   * PATCH /user-reports/admin/:id
   */
  @Patch('admin/:id')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rapor durumunu güncelle (admin)' })
  @ApiResponse({ status: 200, description: 'Rapor güncellendi', type: ReportResponseDto })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  async updateReportStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateReportStatusDto,
  ): Promise<ReportResponseDto> {
    return this.reportService.updateReportStatus(id, adminId, dto);
  }
}
