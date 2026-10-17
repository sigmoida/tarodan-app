import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SecurityService } from "./security.service";
import {
  Verify2FADto,
  Disable2FADto,
  ChangePasswordDto,
  Enable2FAResponseDto,
  TwoFactorStatusDto,
  CsrfTokenResponseDto,
  AdminSessionListDto,
} from "./dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminRole } from "@prisma/client";

@Controller("security")
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  // ==========================================================================
  // TWO-FACTOR AUTHENTICATION (GAP-004)
  // ==========================================================================

  /**
   * Get 2FA status
   * GET /security/2fa/status
   */
  @Get("2fa/status")
  async get2FAStatus(@Request() req: any): Promise<TwoFactorStatusDto> {
    return this.securityService.get2FAStatus(req.user.id);
  }

  /**
   * Enable 2FA (get secret and QR code)
   * POST /security/2fa/enable
   */
  @Post("2fa/enable")
  async enable2FA(@Request() req: any): Promise<Enable2FAResponseDto> {
    return this.securityService.enable2FA(req.user.id);
  }

  /**
   * Verify 2FA code and complete setup
   * POST /security/2fa/verify
   */
  @Post("2fa/verify")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify2FA(
    @Request() req: any,
    @Body() dto: Verify2FADto,
  ): Promise<{ success: boolean }> {
    const result = await this.securityService.verify2FA(req.user.id, dto.code);
    return { success: result };
  }

  /**
   * Disable 2FA
   * POST /security/2fa/disable
   */
  @Post("2fa/disable")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async disable2FA(
    @Request() req: any,
    @Body() dto: Disable2FADto,
  ): Promise<{ success: boolean }> {
    const result = await this.securityService.disable2FA(req.user.id, dto.code);
    return { success: result };
  }

  /**
   * Regenerate backup codes
   * POST /security/2fa/backup-codes
   */
  @Post("2fa/backup-codes")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async regenerateBackupCodes(
    @Request() req: any,
    @Body() dto: Verify2FADto,
  ): Promise<{ backupCodes: string[] }> {
    const codes = await this.securityService.regenerateBackupCodes(
      req.user.id,
      dto.code,
    );
    return { backupCodes: codes };
  }

  // ==========================================================================
  // PASSWORD CHANGE
  // ==========================================================================
  // Şifre sıfırlama tek yoldan yapılır: `POST /auth/forgot-password` +
  // `POST /auth/reset-password` (auth-password.service). Buradaki eski
  // `/security/password/request-reset` + `/reset` çifti e-posta göndermiyordu
  // ve kötüye kullanıma açıktı; kaldırıldı (#432).

  /**
   * Change password (authenticated)
   * POST /security/password/change
   */
  @Post("password/change")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: any,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.securityService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    return { message: "Şifreniz başarıyla değiştirildi" };
  }

  // ==========================================================================
  // CSRF PROTECTION (GAP-017)
  // ==========================================================================

  /**
   * Get CSRF token
   * GET /security/csrf-token
   */
  @Get("csrf-token")
  async getCsrfToken(@Request() req: any): Promise<CsrfTokenResponseDto> {
    // Use session ID or user ID as session identifier
    const sessionId = req.user?.sessionId || req.user?.id || "anonymous";
    return this.securityService.generateCsrfToken(sessionId);
  }

  // ==========================================================================
  // ADMIN SESSION MANAGEMENT (GAP-018)
  // ==========================================================================

  /**
   * Get admin sessions
   * GET /security/admin/sessions
   */
  @Get("admin/sessions")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission("settings")
  async getAdminSessions(@Request() req: any): Promise<AdminSessionListDto> {
    return this.securityService.getAdminSessions(
      req.user.adminId,
      req.user.sessionToken,
    );
  }

  /**
   * Terminate specific admin session
   * DELETE /security/admin/sessions/:id
   */
  @Delete("admin/sessions/:id")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission("settings")
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateAdminSession(
    @Param("id", ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<void> {
    return this.securityService.terminateAdminSession(id, req.user.adminId);
  }

  /**
   * Terminate all admin sessions (logout everywhere)
   * DELETE /security/admin/sessions
   */
  @Delete("admin/sessions")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission("settings")
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateAllAdminSessions(@Request() req: any): Promise<void> {
    return this.securityService.terminateAllAdminSessions(req.user.adminId);
  }

  /**
   * Revoke all refresh tokens
   * DELETE /security/tokens
   */
  @Delete("tokens")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllTokens(@Request() req: any): Promise<void> {
    return this.securityService.revokeAllUserTokens(req.user.id);
  }
}
